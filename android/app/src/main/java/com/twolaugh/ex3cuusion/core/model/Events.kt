package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

@Serializable
data class DeferralLog(
    val id: String,
    val date: String,
    val planItemId: String,
    val reason: DeferralReason,
    val note: String? = null
)

@Serializable
data class CompletionEvent(
    val id: String,
    val date: String,
    val planItemId: String,
    val taskIds: List<String>? = null,
    val actualMinutes: Int? = null
)

@Serializable
data class ExecutionEvent(
    val id: String,
    val date: String,
    val createdAt: String,
    val type: ExecutionEventType,
    val taskId: String? = null,
    val taskIds: List<String>? = null,
    val planItemId: String? = null,
    val reason: ExecutionEventReason? = null,
    val note: String? = null,
    val actualMinutes: Int? = null,
    val nextAction: String? = null,
    val blocked: BlockedMetadata? = null,
    val waiting: WaitingMetadata? = null,
    val delegation: DelegationMetadata? = null
)

@Serializable
data class DailyReview(
    val id: String,
    val date: String,
    val createdAt: String,
    val energy: DailyReviewEnergy,
    val planFit: DailyReviewPlanFit,
    val note: String? = null,
    val affectPlanning: Boolean,
    val capacityAdjustmentMinutes: Int,
    val completedCount: Int,
    val partialCount: Int,
    val deferredCount: Int,
    val blockedCount: Int,
    val skippedCount: Int,
    val calibrationSignals: List<String>
)
