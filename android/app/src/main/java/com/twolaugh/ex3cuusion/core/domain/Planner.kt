package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.DailyReviewEnergy
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.DeferralReason
import com.twolaugh.ex3cuusion.core.model.Energy
import com.twolaugh.ex3cuusion.core.model.ExecutionEvent
import com.twolaugh.ex3cuusion.core.model.ExecutionEventReason
import com.twolaugh.ex3cuusion.core.model.ExecutionEventType
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import com.twolaugh.ex3cuusion.core.model.LoadLevel
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.model.Strictness
import com.twolaugh.ex3cuusion.core.model.Task
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// Faithful translation of the planner helper functions in src/lib/planner.ts that the day-list
// brain (T092/T093) reuses. buildDayPlan itself (the T090 timeline generator) is NOT in v1.

// The TS daily/weekly RepeatPolicy variants share one shape; these accessors flatten the Kotlin
// sealed hierarchy back to the TS field reads.
val RepeatPolicy.isNone: Boolean get() = this is RepeatPolicy.None
val RepeatPolicy.daysOrNull: List<Int>? get() = when (this) {
    is RepeatPolicy.Daily -> days
    is RepeatPolicy.Weekly -> days
    is RepeatPolicy.None -> null
}
val RepeatPolicy.cooldownDaysOrNull: Int? get() = when (this) {
    is RepeatPolicy.Daily -> cooldownDays
    is RepeatPolicy.Weekly -> cooldownDays
    is RepeatPolicy.None -> null
}

fun isRepeatPolicyDue(task: Task, date: String): Boolean = when (task.repeatPolicy) {
    is RepeatPolicy.None -> true
    is RepeatPolicy.Daily -> true
    is RepeatPolicy.Weekly -> task.repeatPolicy.daysOrNull?.contains(dayOfWeek(date)) ?: true
}

// TS treats cooldownDays 0 as "no cooldown" (falsy); match that.
fun isInCompletionCooldown(task: Task, date: String): Boolean {
    val cooldownDays = task.repeatPolicy.cooldownDaysOrNull ?: 0
    val lastCompletedAt = task.lastCompletedAt
    if (lastCompletedAt == null || task.repeatPolicy.isNone || cooldownDays == 0) return false
    val completedDate = lastCompletedAt.take(10)
    if (completedDate == date) return false
    return daysUntil(completedDate, date) < cooldownDays
}

// Keep a task that was completed today visible on its day as a done card (T085).
fun completedOnDate(task: Task, date: String): Boolean =
    task.status == TaskStatus.Completed &&
        (task.completedAt?.take(10) == date || task.lastCompletedAt?.take(10) == date)

// True if the task has at least one non-archived, non-completed subtask (T071).
fun hasActiveChildren(state: AppState, taskId: String): Boolean = state.tasks.any { task ->
    task.parentTaskId == taskId && task.status != TaskStatus.Archived && task.status != TaskStatus.Completed
}

fun isTaskPlannable(task: Task, date: String): Boolean {
    if (task.status == TaskStatus.Blocked) return !task.blocked?.unblockAction.isNullOrEmpty()
    if (task.status == TaskStatus.Waiting) {
        val followUpDate = task.waiting?.followUpDate
        return !followUpDate.isNullOrEmpty() && daysUntil(date, followUpDate) <= 0
    }
    val repeatLike = task.completionBehavior == CompletionBehavior.Repeatable ||
        task.completionBehavior == CompletionBehavior.KeepAsSuggestion ||
        task.completionBehavior == CompletionBehavior.RegenerateAfterCompletion
    val statusAllowsPlanning = task.status == TaskStatus.Active ||
        task.status == TaskStatus.Scheduled ||
        (repeatLike && task.status == TaskStatus.Completed)
    if (!statusAllowsPlanning) return false
    if (task.scheduledDate != null && task.scheduledDate != date) return false
    if (task.dateIntent?.kind == DateIntentKind.WeekWindow &&
        !isDateInRange(date, task.dateIntent.startDate ?: "", task.dateIntent.endDate ?: "")
    ) {
        return false
    }
    if (!isRepeatPolicyDue(task, date)) return false
    if (isInCompletionCooldown(task, date)) return false
    return true
}

private fun recentEventsForTask(state: AppState, taskId: String): List<ExecutionEvent> =
    state.executionEvents.filter { it.taskId == taskId || it.taskIds?.contains(taskId) == true }.takeLast(5)

fun taskScore(state: AppState, task: Task, date: String): Double {
    val dueDistance = daysUntil(date, task.dueDate)
    val dueBoost = if (dueDistance <= 0) 25.0 else if (dueDistance <= 2) 16.0 else if (dueDistance <= 5) 8.0 else 0.0
    val strictnessBoost = when (task.strictness) {
        Strictness.Strict -> 8.0
        Strictness.Normal -> 4.0
        Strictness.Flexible -> 0.0
    }
    val relationshipBoost = task.plannerSignals?.relationshipValue ?: 0.0
    val momentumBoost = task.plannerSignals?.momentumValue ?: 0.0
    val softPenalty = if (task.plannerFields.pressureLevel == PressureLevel.Soft) -8.0 else 0.0
    val recent = recentEventsForTask(state, task.id)
    val vaguePenalty = recent.count { event ->
        event.reason == ExecutionEventReason.TooVague ||
            (event.type == ExecutionEventType.PartiallyCompleted && task.definitionOfDone.isNullOrEmpty())
    } * -45.0
    val notImportantPenalty = recent.count { it.reason == ExecutionEventReason.NotImportant } * -25.0
    val lowEnergySignals = min(3, state.deferrals.count { it.reason == DeferralReason.LowEnergy }) +
        min(3, state.dailyReviews.count { it.affectPlanning && it.energy == DailyReviewEnergy.Low })
    val highEnergyPenalty = if (task.energy == Energy.High && lowEnergySignals >= 2) -12.0 else 0.0
    return task.priority * 4.0 +
        task.importance * 3.0 +
        task.urgency * 4.0 +
        dueBoost +
        strictnessBoost +
        relationshipBoost +
        momentumBoost +
        softPenalty +
        vaguePenalty +
        notImportantPenalty +
        highEnergyPenalty
}

// B1 (day-shape, product-definition): capacity = the user's day window, set in Settings. This is
// transient app config, NOT part of the shared JSON state — `state.availableMinutes` stays in the
// model for web compat but Android ignores it entirely.
data class DayWindow(val start: String = DEFAULT_START, val end: String = DEFAULT_END) {
    companion object {
        const val DEFAULT_START = "08:00"
        const val DEFAULT_END = "23:00"
    }
}

// Capacity from the day window. `fullDay` (T110 planning mode / future dates) is the whole
// window; TODAY's remaining capacity = dayEnd - max(currentTime, dayStart), clamped >= 0 — after
// dayEnd the day is honestly over (capacity 0).
//
// Kept from the old availableMinutes-based formula (they describe the user, not the clock):
//   - the deferral-overload reductions (3+ overload deferrals in the last 5 -> -90, 2 -> -60);
//   - the daily-review adjustment, summed over the last 5 planning-affecting reviews and clamped
//     to [-120, +45].
// Dropped: the hardcoded 22:00 day end (now the window's), the 45-minute end-of-day floor and
// the 90/120-minute capacity floors — they existed to keep an arbitrary 300-minute budget from
// reading as "day over" too early; with a real window the honest clamp is just >= 0.
fun calculateCapacity(state: AppState, fullDay: Boolean = false, window: DayWindow = DayWindow()): Int {
    val windowStart = timeToMinutes(window.start)
    val windowEnd = timeToMinutes(window.end)
    val baseline = if (fullDay) {
        max(0, windowEnd - windowStart)
    } else {
        max(0, windowEnd - max(timeToMinutes(state.currentTime), windowStart))
    }
    val recentDeferrals = state.deferrals.takeLast(5)
    val overloadReasons = setOf(DeferralReason.NoTime, DeferralReason.Overplanned, DeferralReason.LowEnergy)
    val overloadSignals = recentDeferrals.count { it.reason in overloadReasons }
    val overloadReduction = if (overloadSignals >= 3) 90 else if (overloadSignals >= 2) 60 else 0
    val reviewAdjustment = max(
        -120,
        min(
            45,
            state.dailyReviews
                .filter { it.affectPlanning && it.date <= state.currentDate }
                .takeLast(5)
                .sumOf { it.capacityAdjustmentMinutes }
        )
    )
    return max(0, baseline - overloadReduction + reviewAdjustment)
}

fun loadLevel(total: Int, available: Int): LoadLevel = when {
    total > available * 1.15 -> LoadLevel.Overloaded
    total > available * 0.85 -> LoadLevel.Heavy
    total < available * 0.45 -> LoadLevel.Light
    else -> LoadLevel.Normal
}

// The calibrated effort estimate (T093 gap fit / capacity): last 3 attributable actuals, applied
// only when their mean drifts more than 20% from the user's raw estimate. Clamped to the task's
// min/max bounds (defaults 5..480).
fun effectiveEffortMinutes(state: AppState, task: Task): Int {
    val actuals = state.completions
        .filter { event ->
            (event.actualMinutes ?: 0) > 0 &&
                (event.taskIds?.contains(task.id) == true || event.planItemId == "plan_${event.date}_${task.id}")
        }
        .takeLast(3)
        .map { it.actualMinutes!! }
    if (actuals.isEmpty()) return task.effortMinutes
    val averageActual = actuals.sum().toDouble() / actuals.size
    if (averageActual > task.effortMinutes * 1.2 || averageActual < task.effortMinutes * 0.8) {
        return max(task.minMinutes ?: 5, min(task.maxMinutes ?: 480, averageActual.roundToInt()))
    }
    return task.effortMinutes
}

// T088 (2c-A): a task's block folder = the NEAREST ancestor-or-self folder whose canBlock is true
// and status != archived. Cycle-guarded with a Set.
fun blockFolderId(state: AppState, task: Task): String? {
    val folders = state.folders
    var current = task.folderId?.let { id -> folders.find { it.id == id } }
    val seen = mutableSetOf<String>()
    while (current != null && current.id !in seen) {
        seen.add(current.id)
        if (current.canBlock == true && current.status != FolderStatus.Archived) return current.id
        val parentId = current.parentFolderId
        current = parentId?.let { id -> folders.find { it.id == id } }
    }
    return null
}

// A task's pillar = the top-most ancestor folder of its folderId (cycle-guarded walk).
fun topAncestorFolder(state: AppState, folderId: String?): Folder? {
    val folders = state.folders
    var current = folderId?.let { id -> folders.find { it.id == id } } ?: return null
    val seen = mutableSetOf<String>()
    while (current.parentFolderId != null && current.id !in seen) {
        seen.add(current.id)
        val parent = folders.find { it.id == current.parentFolderId } ?: break
        current = parent
    }
    return current
}

// Full "A / B / C" path for a folder, walking parentFolderId with cycle guard.
fun folderPath(state: AppState, folderId: String): String? {
    val byId = state.folders.associateBy { it.id }
    val seen = mutableSetOf<String>()
    val names = ArrayDeque<String>()
    var current = byId[folderId]
    while (current != null && current.id !in seen) {
        seen.add(current.id)
        names.addFirst(current.name)
        current = current.parentFolderId?.let { byId[it] }
    }
    return if (names.isEmpty()) null else names.joinToString(" / ")
}
