package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

@Serializable
data class PlannerFields(
    val intentType: IntentType,
    val pressureLevel: PressureLevel,
    val location: TaskLocation? = null,
    val setupCost: SetupCost? = null
)

// Scores may be fractional when AI-authored, so Double even though the seed uses whole numbers.
@Serializable
data class PlannerSignals(
    val avoidanceRisk: Double? = null,
    val momentumValue: Double? = null,
    val relationshipValue: Double? = null,
    val deadlineRisk: Double? = null,
    val recoveryValue: Double? = null,
    val cognitiveLoad: Double? = null
)

@Serializable
data class BlockedMetadata(
    val blockedBy: BlockedBy,
    val note: String? = null,
    val unblockAction: String? = null
)

@Serializable
data class WaitingMetadata(
    val waitingOn: String,
    val requestedAt: String? = null,
    val followUpDate: String? = null,
    val context: String? = null
)

@Serializable
data class DelegationMetadata(
    val outcomeOwner: String,
    val nextActionOwner: String? = null,
    val checkInDate: String? = null,
    val note: String? = null
)

@Serializable
data class DateIntent(
    val kind: DateIntentKind,
    val originalText: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val dueDate: String? = null,
    val scheduledDate: String? = null,
    val confidence: Double
)

@Serializable
data class TaskPhase(
    val id: String,
    val title: String,
    val kind: TaskPhaseKind,
    val effortMinutes: Int,
    val offsetMinutes: Int? = null,
    val attentionLoad: AttentionLoad,
    val canOverlap: Boolean? = null,
    val overlapKinds: List<OverlapKind>? = null
)

@Serializable
data class SchedulingMetadata(
    val mode: SchedulingMode,
    val attentionLoad: AttentionLoad,
    val canOverlap: Boolean,
    val overlapKinds: List<OverlapKind>? = null,
    val phases: List<TaskPhase>? = null
)

@Serializable
data class Task(
    val id: String,
    val title: String,
    val description: String? = null,
    val type: TaskType,
    val folderId: String? = null,
    val parentTaskId: String? = null,
    val sourceInboxItemId: String? = null,
    val status: TaskStatus,
    val repeatPolicy: RepeatPolicy,
    val completionBehavior: CompletionBehavior,
    val completionMode: CompletionMode? = null,
    val definitionOfDone: String? = null,
    val plannerFields: PlannerFields,
    val plannerSignals: PlannerSignals? = null,
    val tags: List<String>? = null,
    val fieldConfidence: Map<String, Double>? = null,
    val priority: Int,
    val importance: Int,
    val urgency: Int,
    val dueDate: String? = null,
    val scheduledDate: String? = null,
    val scheduledTime: String? = null,
    val dateIntent: DateIntent? = null,
    val scheduling: SchedulingMetadata? = null,
    val effortMinutes: Int,
    val minMinutes: Int? = null,
    val maxMinutes: Int? = null,
    val estimateConfidence: Double? = null,
    val energy: Energy,
    val strictness: Strictness,
    val notes: String? = null,
    val blockedReason: String? = null,
    val blocked: BlockedMetadata? = null,
    val waiting: WaitingMetadata? = null,
    val delegation: DelegationMetadata? = null,
    val completedAt: String? = null,
    val lastCompletedAt: String? = null,
    val source: String? = null,
    val habit: Boolean? = null,
    // T095: conscious release — archived guilt-free via "let go", distinct from a plain archive.
    val released: Boolean? = null
)
