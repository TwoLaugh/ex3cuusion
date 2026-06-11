package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.ExecutionEventType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// T096 — task timer & forecasting calibration, implemented fresh from the ticket. The timer runs
// on the state clock (persisted start timestamp, so it survives reload); stop writes
// actualMinutes into the existing completion/execution machinery so effectiveEffortMinutes and
// the T093 calibrated capacity see real durations.
class TimerTest {

    private lateinit var engine: DomainEngine
    private lateinit var taskId: String

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock("2026-06-01", "09:00")
        taskId = engine.createTask(TaskPatch(title = "Deep work", effortMinutes = 30))
    }

    @Test
    fun `start pause resume accumulate wall-clock segments`() {
        engine.startTaskTimer(taskId)
        assertEquals("2026-06-01T09:00:00.000Z", engine.state.activeTimer?.startedAt)

        engine.setClock("2026-06-01", "09:10")
        engine.pauseTaskTimer()
        assertEquals(10, engine.state.activeTimer?.accumulatedMinutes)
        assertNull(engine.state.activeTimer?.startedAt) // paused: no running segment

        engine.setClock("2026-06-01", "09:25")
        engine.pauseTaskTimer() // pausing a paused timer is a no-op
        assertEquals(10, engine.state.activeTimer?.accumulatedMinutes)

        engine.setClock("2026-06-01", "09:30")
        engine.resumeTaskTimer()
        engine.setClock("2026-06-01", "09:45")
        val actual = engine.stopTaskTimer(complete = false)
        assertEquals(25, actual) // 10 accumulated + 15 running
        assertNull(engine.state.activeTimer)
    }

    @Test
    fun `stop with complete writes actualMinutes into the completion and calibration sees it`() {
        engine.startTaskTimer(taskId)
        engine.setClock("2026-06-01", "10:00")
        val actual = engine.stopTaskTimer(complete = true)
        assertEquals(60, actual)

        val completion = engine.state.completions.single { it.taskIds == listOf(taskId) }
        assertEquals(60, completion.actualMinutes)
        assertEquals("plan_2026-06-01_$taskId", completion.planItemId)
        assertTrue(taskCompletedOnDate(engine.state, engine.state.tasks.first { it.id == taskId }, "2026-06-01"))

        // effectiveEffortMinutes (the planner/T093 calibration input) now prefers the actual.
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals(60, effectiveEffortMinutes(engine.state, task))
        assertNull(engine.state.activeTimer)
    }

    @Test
    fun `stop without complete records a worked_on execution event instead`() {
        engine.startTaskTimer(taskId)
        engine.setClock("2026-06-01", "09:20")
        val actual = engine.stopTaskTimer(complete = false)
        assertEquals(20, actual)

        val event = engine.state.executionEvents.last()
        assertEquals(ExecutionEventType.WorkedOn, event.type)
        assertEquals(listOf(taskId), event.taskIds)
        assertEquals(20, event.actualMinutes)
        assertTrue(engine.state.completions.none { it.taskIds?.contains(taskId) == true }) // not completed
        assertFalse(taskCompletedOnDate(engine.state, engine.state.tasks.first { it.id == taskId }, "2026-06-01"))
    }

    @Test
    fun `one timer at a time - starting another task replaces the running timer`() {
        val otherId = engine.createTask(TaskPatch(title = "Other work", effortMinutes = 10))
        engine.startTaskTimer(taskId)
        engine.setClock("2026-06-01", "09:30")
        engine.startTaskTimer(otherId)
        assertEquals(otherId, engine.state.activeTimer?.taskId)
        assertEquals(0, engine.state.activeTimer?.accumulatedMinutes) // the old segment is gone, not merged
        assertEquals("2026-06-01T09:30:00.000Z", engine.state.activeTimer?.startedAt)
    }

    @Test
    fun `only stop records undo history`() {
        val baseline = engine.listChangeHistory().size
        engine.startTaskTimer(taskId)
        engine.setClock("2026-06-01", "09:10")
        engine.pauseTaskTimer()
        engine.resumeTaskTimer()
        assertEquals(baseline, engine.listChangeHistory().size) // start/pause/resume: no history

        engine.stopTaskTimer(complete = true)
        assertEquals(baseline + 1, engine.listChangeHistory().size) // ONE undoable change

        engine.undoChange() // rewinds the completion AND restores the running timer
        assertEquals(taskId, engine.state.activeTimer?.taskId)
        assertTrue(engine.state.completions.none { it.taskIds?.contains(taskId) == true })
    }
}
