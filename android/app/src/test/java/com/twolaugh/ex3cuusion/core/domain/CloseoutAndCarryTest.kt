package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.CompletionEvent
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// T095 — day close-out & honest carrying, implemented fresh from the ticket: the close-out card
// (done rows, minutes by pillar, habit ticks, streaks kept, carry count, week strip), the
// carriedCount chain with the 3+ nudge, conscious release, and the WIP median gauge.
class CloseoutAndCarryTest {

    private lateinit var engine: DomainEngine

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock("2026-06-01", "08:30")
    }

    @Test
    fun `closeout reports done rows with pillar minutes - habit ticks and the week strip`() {
        engine.updateTask("task_back_rehab", TaskPatch(habit = true))
        engine.dayListView() // morning build (empty list: the only recurring task became a habit)

        val houseId = engine.createTask(TaskPatch(title = "Fix the gate", folderId = "domain_house", effortMinutes = 30))
        engine.addTaskToDayList(houseId)
        val leftoverId = engine.instantCaptureToDayList("Sort the post")
        engine.completeTaskDirect(houseId, actualMinutes = 45) // timer-style actual beats the estimate
        engine.completeTaskDirect("task_back_rehab") // habit tick

        val closeout = engine.closeoutView()
        assertEquals("2026-06-01", closeout.date)
        assertEquals(1, closeout.doneCount) // the habit tick is counted separately, not as a done row
        assertEquals(houseId, closeout.done.single().taskId)
        assertEquals(45, closeout.done.single().minutes) // actualMinutes, not the 30m estimate
        assertEquals("House Work", closeout.done.single().pillarName)
        assertEquals(listOf("House Work" to 45), closeout.minutesByPillar.map { it.name to it.minutes })

        assertEquals(1, closeout.habitsTicked)
        assertEquals(1, closeout.habitsTotal)
        assertEquals(0, closeout.streaksKept) // a 1-day streak is a start, not a kept streak

        assertEquals(1, closeout.carriedForward) // the unfinished capture will carry; the done task will not
        assertEquals(leftoverId, engine.dayListView().entries.last().taskId) // (sanity: it is on the list)

        assertEquals(7, closeout.weekStrip.size)
        assertEquals(CloseoutWeekDay("2026-06-01", plannedCount = 2, doneCount = 2), closeout.weekStrip.last())
        assertEquals(CloseoutWeekDay("2026-05-31", plannedCount = 0, doneCount = 0), closeout.weekStrip[5])
    }

    @Test
    fun `closeout streaksKept counts habits whose run reached two or more days`() {
        val flossId = engine.createTask(
            TaskPatch(
                title = "Floss", effortMinutes = 5, habit = true,
                repeatPolicy = com.twolaugh.ex3cuusion.core.model.RepeatPolicy.Daily(carryover = com.twolaugh.ex3cuusion.core.model.Carryover.Skip),
                completionBehavior = com.twolaugh.ex3cuusion.core.model.CompletionBehavior.Repeatable
            )
        )
        engine.completeTaskDirect(flossId) // 06-01
        engine.advanceDay()
        engine.completeTaskDirect(flossId) // 06-02: streak 2 -> kept
        assertEquals(1, engine.closeoutView().streaksKept)
    }

    @Test
    fun `carriedCount increments across morning builds and flags the row at three carries`() {
        val carryId = engine.createTask(TaskPatch(title = "Carry me", effortMinutes = 15))
        engine.dayListView()
        engine.addTaskToDayList(carryId)
        assertNull(engine.dayListView().entries.find { it.taskId == carryId }?.carriedCount) // not carried yet

        engine.advanceDay() // 06-02: first carry
        var entry = engine.dayListView().entries.find { it.taskId == carryId }
        assertEquals(1, entry?.carriedCount)
        assertEquals(false, entry?.carryNudge)

        engine.advanceDay() // 06-03: second carry
        assertEquals(2, engine.dayListView().entries.find { it.taskId == carryId }?.carriedCount)

        engine.advanceDay() // 06-04: third carry -> the row offers split / someday / release
        entry = engine.dayListView().entries.find { it.taskId == carryId }
        assertEquals(3, entry?.carriedCount)
        assertEquals(true, entry?.carryNudge)
    }

    @Test
    fun `release archives with the released flag - removes the entry and rewinds on undo`() {
        val relId = engine.createTask(TaskPatch(title = "Old promise", effortMinutes = 30))
        engine.dayListView()
        engine.addTaskToDayList(relId)
        val baseline = engine.listChangeHistory().size

        engine.releaseTask(relId)
        val released = engine.state.tasks.find { it.id == relId }
        assertEquals(TaskStatus.Archived, released?.status)
        assertEquals(true, released?.released) // distinct from a plain archive
        assertFalse(engine.dayListView().entries.any { it.taskId == relId })
        assertEquals(baseline + 1, engine.listChangeHistory().size)
        assertTrue(engine.listChangeHistory().first().summary.startsWith("Let go:"))
        engine.releaseTask(relId) // idempotent on an archived task
        assertEquals(baseline + 1, engine.listChangeHistory().size)

        engine.undoChange()
        val restored = engine.state.tasks.find { it.id == relId }
        assertEquals(TaskStatus.Active, restored?.status)
        assertNull(restored?.released)
        assertTrue(engine.dayListView().entries.any { it.taskId == relId })
    }

    @Test
    fun `WIP median needs five days of completion history and is the median done-day size`() {
        // Four past completed days: not enough history -> the gauge stays silent.
        fun completionOn(date: String, taskIds: List<String>) = CompletionEvent(
            id = "completion_$date", date = date, planItemId = "plan_${date}_x", taskIds = taskIds
        )
        val fourDays = seedState().copy(
            completions = listOf(
                completionOn("2026-05-20", listOf("x1")),
                completionOn("2026-05-21", listOf("x1", "x2")),
                completionOn("2026-05-22", listOf("x1", "x2", "x3")),
                completionOn("2026-05-23", listOf("x1", "x2", "x3", "x4"))
            )
        )
        engine = testEngine(fourDays)
        engine.setClock("2026-06-01", "08:30")
        assertNull(engine.dayListView().gauges.medianDoneCount)

        // A fifth day completes the history: counts 1,2,3,4,5 -> median 3.
        val fiveDays = fourDays.copy(
            completions = fourDays.completions + completionOn("2026-05-24", listOf("x1", "x2", "x3", "x4", "x5"))
        )
        engine = testEngine(fiveDays)
        engine.setClock("2026-06-01", "08:30")
        assertEquals(3, engine.dayListView().gauges.medianDoneCount)
    }
}
