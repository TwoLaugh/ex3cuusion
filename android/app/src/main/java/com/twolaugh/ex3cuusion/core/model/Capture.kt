@file:OptIn(ExperimentalSerializationApi::class)

package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// TS payload is Record<string, unknown>: deliberately untyped, so JsonObject here.
@Serializable
data class AiAction(
    val id: String,
    val type: AiActionType,
    val label: String,
    val payload: JsonObject,
    val safety: AiActionSafety,
    val status: AiActionStatus,
    val appliedEntityId: String? = null,
    val skippedReason: String? = null,
    val validationErrors: List<String>? = null,
    val model: String? = null,
    val createdAt: String? = null,
    val captureSessionId: String? = null,
    val sourceMessageId: String? = null,
    val pendingQuestionId: String? = null,
    val pendingFolderName: String? = null
)

@Serializable
data class AiDebugCall(
    val label: String,
    val model: String? = null,
    val createdAt: String,
    val instructions: String,
    val input: String,
    val response: String,
    val parsedResponse: JsonElement? = null
)

@Serializable
data class AiDebugTrace(
    val calls: List<AiDebugCall>
)

@Serializable
data class InboxEntry(
    val id: String,
    val createdAt: String,
    val input: String,
    val actions: List<AiAction>,
    val summary: String,
    val captureSessionId: String? = null,
    val debugTrace: AiDebugTrace? = null
)

@Serializable
data class CaptureMessage(
    val id: String,
    val role: MessageRole,
    val content: String,
    val createdAt: String
)

@Serializable
data class ClarificationQuestion(
    val id: String,
    val actionId: String,
    val question: String,
    val kind: ClarificationKind,
    val mode: ClarificationMode,
    val status: QuestionStatus,
    val options: List<String>? = null,
    val materiality: Materiality? = null,
    val rationale: String? = null,
    val answer: String? = null,
    val createdAt: String,
    val answeredAt: String? = null
)

// TS before/after are Partial<Task> (every field optional) — kept as raw JsonObject because a
// Kotlin Task mirror cannot drop its required fields.
@Serializable
data class CaptureRevisionEvent(
    val id: String,
    val createdAt: String,
    val source: RevisionSource,
    val taskId: String? = null,
    val actionId: String? = null,
    val model: String? = null,
    val confidence: Double? = null,
    val summary: String,
    val changes: List<String>,
    val before: JsonObject? = null,
    val after: JsonObject? = null
)

// Array fields default to empty (normalizeState's per-session ??= []) but are ALWAYS encoded,
// matching what the web's JSON.stringify writes after normalization.
@Serializable
data class CaptureSession(
    val id: String,
    val status: CaptureSessionStatus,
    val source: CaptureSource,
    val createdAt: String,
    val updatedAt: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val messages: List<CaptureMessage> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val questions: List<ClarificationQuestion> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val actionIds: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val draftActionIds: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val appliedEntityIds: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val answeredFields: List<String> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val revisionEvents: List<CaptureRevisionEvent> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val unresolvedFields: List<String> = emptyList(),
    val summary: String
)
