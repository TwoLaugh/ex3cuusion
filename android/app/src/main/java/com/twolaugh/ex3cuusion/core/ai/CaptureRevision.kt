package com.twolaugh.ex3cuusion.core.ai

import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// T105: the LIGHT single-task enrichment contract — a hand-port of captureRevisionSchema in
// src/lib/ai-actions.ts. One revision describes what the model believes a newly captured task
// implied (folder, dates, effort, scores, done-state); deterministic code downstream validates
// and applies it (DomainEngine.applyEnrichment).
@Serializable
data class CaptureRevision(
    val summary: String = "",
    val shouldApply: Boolean = false,
    val confidence: Double = 0.0,
    val title: String? = null,
    val folderName: String? = null,
    val dateIntent: RevisionDateIntent? = null,
    val scheduledDate: String? = null,
    val scheduledTime: String? = null,
    val dueDate: String? = null,
    val effortMinutes: Int? = null,
    val priority: Int? = null,
    val importance: Int? = null,
    val urgency: Int? = null,
    val definitionOfDone: String? = null,
    val completionBehavior: CompletionBehavior? = null,
    val completionMode: CompletionMode? = null,
    val note: String? = null,
    val changes: List<String> = emptyList()
)

// The revision's dateIntent union (a different set from the persisted DateIntentKind).
@Serializable
enum class RevisionDateIntent {
    @SerialName("unchanged") Unchanged,
    @SerialName("today") Today,
    @SerialName("tomorrow") Tomorrow,
    @SerialName("this_week") ThisWeek,
    @SerialName("next_week") NextWeek,
    @SerialName("someday") Someday,
    @SerialName("specific_date") SpecificDate,
    @SerialName("deadline") Deadline
}
