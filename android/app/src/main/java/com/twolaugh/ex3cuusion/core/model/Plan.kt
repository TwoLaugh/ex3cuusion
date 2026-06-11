package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

@Serializable
data class PlanItem(
    val id: String,
    val type: PlanItemType,
    val title: String,
    val section: PlanSection,
    val status: PlanItemStatus,
    val startTime: String,
    val endTime: String,
    val fixedStartTime: String? = null,
    val folderId: String? = null,
    val taskId: String? = null,
    val routineId: String? = null,
    val selectedTaskIds: List<String>? = null,
    val estimatedMinutes: Int,
    val clockMinutes: Int? = null,
    val blockingMinutes: Int? = null,
    val schedulingMode: SchedulingMode? = null,
    val attentionLoad: AttentionLoad? = null,
    val canOverlap: Boolean? = null,
    val overlapKinds: List<OverlapKind>? = null,
    val phaseKind: TaskPhaseKind? = null,
    val phaseIndex: Int? = null,
    val parentTaskId: String? = null,
    val hardAnchor: Boolean? = null,
    val reason: String
)

@Serializable
data class DayPlan(
    val date: String,
    val loadLevel: LoadLevel,
    val estimatedTotalMinutes: Int,
    val availableMinutes: Int,
    val summary: String,
    val items: List<PlanItem>,
    val committedAt: String? = null,
    val newCandidateCount: Int? = null
)

// T090: snapshot of the PlanItem fields needed to re-render a committed item. Status is NOT
// stored — it is overlaid live from completions/deferrals/executionEvents and the clock.
@Serializable
data class CommittedPlanItem(
    val id: String,
    val type: PlanItemType,
    val title: String,
    val section: PlanSection,
    val startTime: String,
    val endTime: String,
    val fixedStartTime: String? = null,
    val hardAnchor: Boolean? = null,
    val taskId: String? = null,
    val folderId: String? = null,
    val selectedTaskIds: List<String>? = null,
    val estimatedMinutes: Int,
    val clockMinutes: Int? = null,
    val blockingMinutes: Int? = null,
    val schedulingMode: SchedulingMode? = null,
    val attentionLoad: AttentionLoad? = null,
    val canOverlap: Boolean? = null,
    val overlapKinds: List<OverlapKind>? = null,
    val phaseKind: TaskPhaseKind? = null,
    val phaseIndex: Int? = null,
    val parentTaskId: String? = null,
    val reason: String
)

@Serializable
data class CommittedDayPlan(
    val date: String,
    val committedAt: String,
    val items: List<CommittedPlanItem>
)
