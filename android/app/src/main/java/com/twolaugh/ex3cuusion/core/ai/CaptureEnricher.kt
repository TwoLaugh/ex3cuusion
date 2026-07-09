package com.twolaugh.ex3cuusion.core.ai

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// T105: single-shot capture interpretation against OpenAI's Responses API. A hand-rolled HTTPS
// client (HttpURLConnection + kotlinx-serialization — deliberately NO OpenAI SDK dependency)
// that ports the web's defaultRevisionInterpreter (src/lib/ai-actions.ts): same endpoint, same
// structured-output json_schema (captureRevisionSchema), same 45s timeout, instructions adapted
// from "revise an existing task from a follow-up" to "enrich a newly captured task from its raw
// title". Every failure is swallowed into a typed EnrichmentResult — enrichment must NEVER crash
// or block capture.

const val OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const val ENRICH_TIMEOUT_MS = 45_000
private const val MAX_ATTEMPTS = 2 // 1 retry max — no retry storm

// --- transport (injectable so tests never touch the network) --------------------------------------

data class AiHttpResponse(val status: Int, val body: String)

fun interface AiTransport {
    @Throws(IOException::class)
    fun post(url: String, apiKey: String, body: String): AiHttpResponse
}

class HttpUrlConnectionTransport(private val timeoutMs: Int = ENRICH_TIMEOUT_MS) : AiTransport {
    override fun post(url: String, apiKey: String, body: String): AiHttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $apiKey")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return AiHttpResponse(status, text)
        } finally {
            connection.disconnect()
        }
    }
}

// --- typed result ----------------------------------------------------------------------------------

sealed interface EnrichmentResult {
    data class Success(val revision: CaptureRevision) : EnrichmentResult
    data class Failure(val reason: EnrichmentFailure, val detail: String? = null) : EnrichmentResult
}

enum class EnrichmentFailure {
    // The key was rejected (HTTP 401/403) — the one failure the user should hear about.
    Auth,
    // Timeouts, connectivity, 429/5xx after the single retry.
    Network,
    // A 2xx body that did not contain a parseable capture_revision.
    BadResponse
}

// Compact context for the model: NOT the whole state. Today's clock, the folder list as full
// paths (so folderName resolves), and the capture's current defaults.
data class EnrichmentContext(
    val currentDate: String,
    val currentTime: String,
    val folderPaths: List<String>,
    val effortMinutes: Int,
    val priority: Int,
    val importance: Int,
    val urgency: Int,
    val completionBehavior: String,
    val completionMode: String?
)

// --- the enricher ----------------------------------------------------------------------------------

class CaptureEnricher(
    private val apiKey: String,
    private val model: String,
    private val transport: AiTransport = HttpUrlConnectionTransport()
) {

    fun enrich(taskTitle: String, context: EnrichmentContext): EnrichmentResult {
        val body = requestBody(taskTitle, context)
        var lastFailure = EnrichmentResult.Failure(EnrichmentFailure.Network)
        for (attempt in 1..MAX_ATTEMPTS) {
            val response = try {
                transport.post(OPENAI_RESPONSES_URL, apiKey, body)
            } catch (e: Exception) { // IOException and anything else: enrichment never throws
                lastFailure = EnrichmentResult.Failure(EnrichmentFailure.Network, e.message)
                continue
            }
            when {
                response.status in 200..299 -> return parseRevision(response.body)
                response.status == 401 || response.status == 403 ->
                    return EnrichmentResult.Failure(EnrichmentFailure.Auth, "HTTP ${response.status}")
                response.status == 408 || response.status == 429 || response.status >= 500 ->
                    lastFailure = EnrichmentResult.Failure(EnrichmentFailure.Network, "HTTP ${response.status}")
                else -> return EnrichmentResult.Failure(EnrichmentFailure.BadResponse, "HTTP ${response.status}")
            }
        }
        return lastFailure
    }

    // The Responses API call body: instructions + one user input + text.format json_schema
    // (strict), plus reasoning effort for gpt-5* models (openAiReasoning in ai-actions.ts).
    internal fun requestBody(taskTitle: String, context: EnrichmentContext): String {
        val request = buildJsonObject {
            put("model", model)
            put("instructions", INSTRUCTIONS)
            put("input", buildJsonArray {
                addJsonObject {
                    put("role", "user")
                    put("content", modelInput(taskTitle, context))
                }
            })
            putJsonObject("text") {
                putJsonObject("format") {
                    put("type", "json_schema")
                    put("name", "capture_revision")
                    put("strict", true)
                    put("schema", captureRevisionJsonSchema())
                }
            }
            if (Regex("^gpt-5", RegexOption.IGNORE_CASE).containsMatchIn(model)) {
                putJsonObject("reasoning") { put("effort", "medium") }
            }
        }
        return request.toString()
    }

    private fun modelInput(taskTitle: String, context: EnrichmentContext): String {
        val taskJson = buildJsonObject {
            put("title", taskTitle)
            put("folderId", JsonNull)
            put("scheduledDate", JsonNull)
            put("scheduledTime", JsonNull)
            put("dueDate", JsonNull)
            put("dateIntent", JsonNull)
            put("effortMinutes", context.effortMinutes)
            put("priority", context.priority)
            put("importance", context.importance)
            put("urgency", context.urgency)
            put("completionBehavior", context.completionBehavior)
            put("completionMode", context.completionMode?.let { JsonPrimitive(it) } ?: JsonNull)
            put("definitionOfDone", JsonNull)
            put("notes", JsonNull)
        }
        return "Current date: ${context.currentDate}. Current time: ${context.currentTime}. " +
            "Folders: ${context.folderPaths.joinToString(", ")}. " +
            "Session summary: Instant capture: $taskTitle. " +
            "Newly captured task (current defaults): $taskJson. " +
            "Captured title: $taskTitle"
    }

    // A 2xx Responses API body: output[] -> the "message" item -> content[] -> "output_text".
    private fun parseRevision(body: String): EnrichmentResult {
        return try {
            val root = lenientJson.parseToJsonElement(body).jsonObject
            val output = root["output"]?.jsonArray ?: JsonArray(emptyList())
            val text = output
                .asSequence()
                .mapNotNull { it as? JsonObject }
                .filter { it["type"]?.jsonPrimitive?.contentOrNull == "message" }
                .flatMap { it["content"]?.jsonArray?.asSequence() ?: emptySequence() }
                .mapNotNull { it as? JsonObject }
                .firstOrNull { it["type"]?.jsonPrimitive?.contentOrNull == "output_text" }
                ?.get("text")?.jsonPrimitive?.contentOrNull
                ?: return EnrichmentResult.Failure(EnrichmentFailure.BadResponse, "no output_text in response")
            EnrichmentResult.Success(lenientJson.decodeFromString(CaptureRevision.serializer(), text))
        } catch (e: Exception) {
            EnrichmentResult.Failure(EnrichmentFailure.BadResponse, e.message)
        }
    }

    companion object {
        // coerceInputValues: an out-of-vocabulary enum string degrades to the null default
        // instead of failing the whole revision.
        private val lenientJson = Json { ignoreUnknownKeys = true; coerceInputValues = true }

        // Ported from defaultRevisionInterpreter's instructions (src/lib/ai-actions.ts), adapted
        // minimally: the subject is a NEWLY CAPTURED task being enriched from its raw title, not
        // an existing task being revised by a follow-up message. v1 is single-shot — no chat.
        internal val INSTRUCTIONS =
            "You enrich one newly captured task inside a personal execution planner from its raw captured title. " +
                "Return only fields the captured title clearly implies. Do not create a new task. " +
                "Set title to null; a capture is never renamed. " +
                "Use folderName only when it exactly matches an existing folder by name or full path, and the task clearly belongs there. " +
                "For broad date windows like 'next week' set dateIntent to next_week and leave scheduledDate/dueDate null. " +
                "For deadline wording like 'by Friday' use dueDate. For execution wording like 'tomorrow' or 'today' use scheduledDate/dateIntent. " +
                "For explicit clock times like 'at 5pm' or '17:00', set scheduledTime in HH:mm. Do not invent a date or time the title does not state. " +
                "If the title is a plain task with nothing extra to infer, set shouldApply true and every nullable field null. If it is not a task at all, or unsafe, set shouldApply false."

        // Hand-port of captureRevisionSchema (zodTextFormat output): every nullable field is
        // type [X, "null"], additionalProperties false, all properties required (strict mode).
        internal fun captureRevisionJsonSchema(): JsonObject = buildJsonObject {
            put("type", "object")
            putJsonObject("properties") {
                put("summary", scalar("string"))
                put("shouldApply", scalar("boolean"))
                put("confidence", buildJsonObject {
                    put("type", "number")
                    put("minimum", 0)
                    put("maximum", 1)
                })
                put("title", nullableScalar("string"))
                put("folderName", nullableScalar("string"))
                put("dateIntent", nullableEnum("unchanged", "today", "tomorrow", "this_week", "next_week", "someday", "specific_date", "deadline"))
                put("scheduledDate", nullableScalar("string"))
                put("scheduledTime", nullableScalar("string"))
                put("dueDate", nullableScalar("string"))
                put("effortMinutes", nullableInteger(5, 480))
                put("priority", nullableInteger(1, 9))
                put("importance", nullableInteger(1, 9))
                put("urgency", nullableInteger(1, 9))
                put("definitionOfDone", nullableScalar("string"))
                put("completionBehavior", nullableEnum("exhaust_once", "repeatable", "keep_as_suggestion", "regenerate_after_completion"))
                put("completionMode", nullableEnum("simple_done", "outcome_done", "timebox", "repeatable_checkoff", "progress_accumulating", "suggestion_used"))
                put("note", nullableScalar("string"))
                put("changes", buildJsonObject {
                    put("type", "array")
                    put("items", scalar("string"))
                })
            }
            put("required", buildJsonArray {
                listOf(
                    "summary", "shouldApply", "confidence", "title", "folderName", "dateIntent",
                    "scheduledDate", "scheduledTime", "dueDate", "effortMinutes", "priority",
                    "importance", "urgency", "definitionOfDone", "completionBehavior",
                    "completionMode", "note", "changes"
                ).forEach { add(it) }
            })
            put("additionalProperties", false)
        }

        private fun scalar(type: String): JsonObject = buildJsonObject { put("type", type) }

        private fun nullableScalar(type: String): JsonObject = buildJsonObject {
            put("type", buildJsonArray { add(type); add("null") })
        }

        private fun nullableInteger(minimum: Int, maximum: Int): JsonObject = buildJsonObject {
            put("type", buildJsonArray { add("integer"); add("null") })
            put("minimum", minimum)
            put("maximum", maximum)
        }

        private fun nullableEnum(vararg values: String): JsonObject = buildJsonObject {
            put("type", buildJsonArray { add("string"); add("null") })
            put("enum", buildJsonArray {
                values.forEach { add(it) }
                add(JsonNull)
            })
        }
    }
}
