package com.twolaugh.ex3cuusion.core.ai

import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// T105: the enricher against a fake transport — request shape, response parsing, and the typed
// failure paths. NO live API calls; the transport is injected.
class CaptureEnricherTest {

    private val context = EnrichmentContext(
        currentDate = "2026-06-01",
        currentTime = "08:30",
        folderPaths = listOf("Health Repair", "Diet App / Diet App", "Social Maintenance / Emma"),
        effortMinutes = 30,
        priority = 5,
        importance = 3,
        urgency = 3,
        completionBehavior = "exhaust_once",
        completionMode = "simple_done"
    )

    private class RecordingTransport(private val responses: List<AiHttpResponse>) : AiTransport {
        val requests = mutableListOf<Triple<String, String, String>>()
        override fun post(url: String, apiKey: String, body: String): AiHttpResponse {
            requests.add(Triple(url, apiKey, body))
            return responses[(requests.size - 1).coerceAtMost(responses.size - 1)]
        }
    }

    private fun responsesBody(revisionJson: String): String =
        """{"id":"resp_1","status":"completed","output":[{"type":"reasoning","summary":[]},{"type":"message","role":"assistant","content":[{"type":"output_text","text":${kotlinx.serialization.json.JsonPrimitive(revisionJson)}}]}]}"""

    @Test
    fun `parses a structured revision from the responses payload`() {
        val revisionJson = """{"summary":"Filed under Emma.","shouldApply":true,"confidence":0.82,
            "title":null,"folderName":"Social Maintenance / Emma","dateIntent":"today",
            "scheduledDate":"2026-06-01","scheduledTime":"17:00","dueDate":null,"effortMinutes":20,
            "priority":null,"importance":null,"urgency":null,"definitionOfDone":null,
            "completionBehavior":"exhaust_once","completionMode":null,"note":null,
            "changes":["moved under Emma","scheduled for 17:00"]}"""
        val transport = RecordingTransport(listOf(AiHttpResponse(200, responsesBody(revisionJson))))
        val result = CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Plan a date night", context)

        assertTrue(result is EnrichmentResult.Success)
        val revision = (result as EnrichmentResult.Success).revision
        assertTrue(revision.shouldApply)
        assertEquals(0.82, revision.confidence, 1e-9)
        assertEquals("Social Maintenance / Emma", revision.folderName)
        assertEquals(RevisionDateIntent.Today, revision.dateIntent)
        assertEquals("17:00", revision.scheduledTime)
        assertEquals(20, revision.effortMinutes)
        assertEquals(CompletionBehavior.ExhaustOnce, revision.completionBehavior)
        assertEquals(1, transport.requests.size)
    }

    @Test
    fun `request carries the schema and the compact context`() {
        val transport = RecordingTransport(listOf(AiHttpResponse(200, responsesBody("{}"))))
        CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Water plants", context)

        val (url, apiKey, body) = transport.requests.single()
        assertEquals(OPENAI_RESPONSES_URL, url)
        assertEquals("sk-test", apiKey)
        assertTrue(body.contains("\"json_schema\""))
        assertTrue(body.contains("\"capture_revision\""))
        assertTrue(body.contains("\"strict\":true"))
        assertTrue(body.contains("\"additionalProperties\":false"))
        assertTrue(body.contains("Diet App / Diet App")) // folders go in as full paths
        assertTrue(body.contains("Current date: 2026-06-01"))
        assertTrue(body.contains("Captured title: Water plants"))
        assertTrue(body.contains("\"reasoning\"")) // gpt-5* gets a reasoning effort
    }

    @Test
    fun `auth failures are typed and never retried`() {
        val transport = RecordingTransport(listOf(AiHttpResponse(401, """{"error":{"message":"bad key"}}""")))
        val result = CaptureEnricher("sk-bad", "gpt-5.4-mini", transport).enrich("Water plants", context)
        assertTrue(result is EnrichmentResult.Failure)
        assertEquals(EnrichmentFailure.Auth, (result as EnrichmentResult.Failure).reason)
        assertEquals(1, transport.requests.size)
    }

    @Test
    fun `server errors retry exactly once then fail typed`() {
        val transport = RecordingTransport(listOf(AiHttpResponse(500, "boom"), AiHttpResponse(500, "boom")))
        val result = CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Water plants", context)
        assertTrue(result is EnrichmentResult.Failure)
        assertEquals(EnrichmentFailure.Network, (result as EnrichmentResult.Failure).reason)
        assertEquals(2, transport.requests.size) // 1 retry max — no retry storm
    }

    @Test
    fun `transport exceptions are swallowed into a typed failure`() {
        val transport = AiTransport { _, _, _ -> throw java.io.IOException("timeout") }
        val result = CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Water plants", context)
        assertTrue(result is EnrichmentResult.Failure)
        assertEquals(EnrichmentFailure.Network, (result as EnrichmentResult.Failure).reason)
    }

    @Test
    fun `a garbled body is a BadResponse, not a crash`() {
        val transport = RecordingTransport(listOf(AiHttpResponse(200, "not json at all")))
        val result = CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Water plants", context)
        assertTrue(result is EnrichmentResult.Failure)
        assertEquals(EnrichmentFailure.BadResponse, (result as EnrichmentResult.Failure).reason)
    }

    @Test
    fun `unknown enum values degrade to null instead of failing the revision`() {
        val revisionJson = """{"summary":"s","shouldApply":true,"confidence":0.9,
            "title":null,"folderName":null,"dateIntent":"fortnight","scheduledDate":null,
            "scheduledTime":null,"dueDate":null,"effortMinutes":null,"priority":null,
            "importance":null,"urgency":null,"definitionOfDone":null,
            "completionBehavior":"sometimes","completionMode":null,"note":null,"changes":[]}"""
        val transport = RecordingTransport(listOf(AiHttpResponse(200, responsesBody(revisionJson))))
        val result = CaptureEnricher("sk-test", "gpt-5.4-mini", transport).enrich("Water plants", context)
        assertTrue(result is EnrichmentResult.Success)
        val revision = (result as EnrichmentResult.Success).revision
        assertEquals(null, revision.dateIntent)
        assertEquals(null, revision.completionBehavior)
    }
}
