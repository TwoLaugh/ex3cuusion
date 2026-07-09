package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.Carryover
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.CompletionEvent
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import com.twolaugh.ex3cuusion.core.model.DailyReview
import com.twolaugh.ex3cuusion.core.model.DailyReviewEnergy
import com.twolaugh.ex3cuusion.core.model.DailyReviewPlanFit
import com.twolaugh.ex3cuusion.core.model.DeferralLog
import com.twolaugh.ex3cuusion.core.model.DeferralReason
import com.twolaugh.ex3cuusion.core.model.Energy
import com.twolaugh.ex3cuusion.core.model.IntentType
import com.twolaugh.ex3cuusion.core.model.PlannerFields
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.model.Strictness
import com.twolaugh.ex3cuusion.core.model.Task
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.model.TaskType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Spot suite for the planner helpers (Planner.kt): repeat-policy due days, completion cooldown,
// taskScore due boosts, and the calibration/capacity assertions ported from planner.test.ts.
class PlannerHelpersTest {

    private fun baseTask(id: String = "task_x") = Task(
        id = id, title = "X", type = TaskType.Atomic, status = TaskStatus.Active,
        repeatPolicy = RepeatPolicy.None, completionBehavior = CompletionBehavior.ExhaustOnce,
        completionMode = CompletionMode.SimpleDone,
        plannerFields = PlannerFields(IntentType.Obligation, PressureLevel.Soft),
        priority = 3, importance = 3, urgency = 3, effortMinutes = 30,
        energy = Energy.Medium, strictness = Strictness.Normal
    )

    @Test
    fun `weekly repeat is due only on its configured days - daily always`() {
        val weekly = baseTask().copy(repeatPolicy = RepeatPolicy.Weekly(days = listOf(0, 3, 6), carryover = Carryover.Skip))
        assertFalse(isRepeatPolicyDue(weekly, "2026-06-01")) // Monday (1)
        assertTrue(isRepeatPolicyDue(weekly, "2026-06-03")) // Wednesday (3)
        assertTrue(isRepeatPolicyDue(weekly, "2026-06-06")) // Saturday (6)
        assertTrue(isRepeatPolicyDue(weekly, "2026-06-07")) // Sunday (0)
        val daily = baseTask().copy(repeatPolicy = RepeatPolicy.Daily(carryover = Carryover.Skip))
        assertTrue(isRepeatPolicyDue(daily, "2026-06-01"))
    }

    @Test
    fun `completion cooldown suppresses a repeat until cooldownDays have passed`() {
        val task = baseTask().copy(
            repeatPolicy = RepeatPolicy.Daily(carryover = Carryover.Skip, cooldownDays = 3),
            lastCompletedAt = "2026-06-01T12:00:00.000Z"
        )
        assertFalse(isInCompletionCooldown(task, "2026-06-01")) // the completion day itself shows the done card
        assertTrue(isInCompletionCooldown(task, "2026-06-02")) // 1 < 3
        assertTrue(isInCompletionCooldown(task, "2026-06-03")) // 2 < 3
        assertFalse(isInCompletionCooldown(task, "2026-06-04")) // 3 >= 3: due again
        assertFalse(isInCompletionCooldown(task.copy(repeatPolicy = RepeatPolicy.None), "2026-06-02")) // no repeat, no cooldown
    }

    @Test
    fun `taskScore boosts approaching due dates in 25-16-8 bands`() {
        val state = seedState()
        val base = baseTask()
        val noDue = taskScore(state, base, "2026-06-01")
        assertEquals(29.0, noDue, 1e-9) // 12 + 9 + 12 + 4 strictness - 8 soft
        assertEquals(noDue + 25, taskScore(state, base.copy(dueDate = "2026-06-01"), "2026-06-01"), 1e-9) // due today
        assertEquals(noDue + 25, taskScore(state, base.copy(dueDate = "2026-05-30"), "2026-06-01"), 1e-9) // overdue
        assertEquals(noDue + 16, taskScore(state, base.copy(dueDate = "2026-06-03"), "2026-06-01"), 1e-9) // <= 2 days
        assertEquals(noDue + 8, taskScore(state, base.copy(dueDate = "2026-06-06"), "2026-06-01"), 1e-9) // <= 5 days
        assertEquals(noDue, taskScore(state, base.copy(dueDate = "2026-06-12"), "2026-06-01"), 1e-9) // far future
    }

    @Test
    fun `capacity drops after repeated overload deferrals`() {
        // B1: the seed clock is 08:30 in the default 08:00-23:00 window -> 870 remaining; three
        // overload deferrals keep the old -90 reduction: 870 - 90 = 780.
        val state = seedState().copy(
            deferrals = listOf(
                DeferralLog(id = "d1", date = "2026-06-01", planItemId = "a", reason = DeferralReason.Overplanned),
                DeferralLog(id = "d2", date = "2026-06-01", planItemId = "b", reason = DeferralReason.NoTime),
                DeferralLog(id = "d3", date = "2026-06-02", planItemId = "c", reason = DeferralReason.LowEnergy)
            )
        )
        assertEquals(780, calculateCapacity(state))
    }

    @Test
    fun `daily review calibration reduces future capacity`() {
        // B1: 870 window-remaining at 08:30, the review adjustment is kept: 870 - 75 = 795.
        val state = seedState().copy(
            currentDate = "2026-06-02",
            dailyReviews = listOf(
                DailyReview(
                    id = "review_low_energy", date = "2026-06-01", createdAt = "2026-06-01T22:00:00.000Z",
                    energy = DailyReviewEnergy.Low, planFit = DailyReviewPlanFit.Overplanned,
                    affectPlanning = true, capacityAdjustmentMinutes = -75,
                    completedCount = 1, partialCount = 1, deferredCount = 2, blockedCount = 0, skippedCount = 0,
                    calibrationSignals = listOf("review marked the day as overplanned", "review marked low energy")
                )
            )
        )
        assertEquals(795, calculateCapacity(state))
    }

    @Test
    fun `capacity derives from the day window - remaining today, clamped, full for planning`() {
        val window = DayWindow(start = "09:00", end = "21:00")
        // mid-day: 21:00 - 14:00 = 420 remaining
        assertEquals(420, calculateCapacity(seedState().copy(currentTime = "14:00"), window = window))
        // before the window opens: the clock clamps to dayStart -> the full 720
        assertEquals(720, calculateCapacity(seedState().copy(currentTime = "07:15"), window = window))
        // after dayEnd: the day is over -> 0, no phantom floor
        assertEquals(0, calculateCapacity(seedState().copy(currentTime = "21:30"), window = window))
        // planning a future date: the full window regardless of tonight's clock
        assertEquals(720, calculateCapacity(seedState().copy(currentTime = "21:30"), fullDay = true, window = window))
        // the >= 0 clamp holds even when overload reductions push the figure negative
        val overloaded = seedState().copy(
            currentTime = "22:30",
            deferrals = listOf(
                DeferralLog(id = "d1", date = "2026-06-01", planItemId = "a", reason = DeferralReason.Overplanned),
                DeferralLog(id = "d2", date = "2026-06-01", planItemId = "b", reason = DeferralReason.NoTime)
            )
        )
        assertEquals(0, calculateCapacity(overloaded, window = window))
    }

    @Test
    fun `effective effort calibrates from actual completion time when it drifts 20 percent`() {
        // planner.test.ts "calibrates future estimates from actual completion time" (45 vs 20).
        val walk = baseTask(id = "task_daily_walk").copy(
            title = "Daily walk",
            repeatPolicy = RepeatPolicy.Daily(carryover = Carryover.Skip),
            completionBehavior = CompletionBehavior.Repeatable,
            effortMinutes = 20
        )
        val state = seedState().copy(
            tasks = listOf(walk),
            completions = listOf(
                CompletionEvent(
                    id = "completion_walk", date = "2026-06-01",
                    planItemId = "plan_2026-06-01_task_daily_walk",
                    taskIds = listOf("task_daily_walk"), actualMinutes = 45
                )
            )
        )
        assertEquals(45, effectiveEffortMinutes(state, walk))
        // Within the 20% band the user's estimate stands.
        val inBand = state.copy(completions = listOf(state.completions[0].copy(actualMinutes = 22)))
        assertEquals(20, effectiveEffortMinutes(inBand, walk))
    }
}
