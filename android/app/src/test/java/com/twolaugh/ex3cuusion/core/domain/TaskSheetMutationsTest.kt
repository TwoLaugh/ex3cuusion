package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.ExecutionEventType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// The TASK SHEET's engine surface: logTaskProgress (the manual sibling of a timer stop), the
// tags patch, the save-path pin sync, the habit toggle's strip/list membership, and the
// "no-op save records nothing" guarantee.
class TaskSheetMutationsTest {

    private lateinit var engine: DomainEngine

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock("2026-06-01", "08:30")
    }

    @Test
    fun `logTaskProgress writes the stopTimer worked_on shape, sums into the view, and undoes`() {
        val id = engine.createTask(TaskPatch(title = "Slow burn", effortMinutes = 60))
        engine.dayListView() // materialize today's list
        engine.addTaskToDayList(id)
        val baseline = engine.listChangeHistory().size

        engine.logTaskProgress(id, 25)
        val event = engine.state.executionEvents.last()
        assertEquals(ExecutionEventType.WorkedOn, event.type)
        assertEquals(listOf(id), event.taskIds)
        assertEquals("plan_2026-06-01_$id", event.planItemId)
        assertEquals(25, event.actualMinutes)
        assertEquals("2026-06-01", event.date)
        assertEquals(baseline + 1, engine.listChangeHistory().size)
        assertEquals("Logged 25m on \"Slow burn\"", engine.listChangeHistory().first().summary)

        // logs accumulate into the entry view; logging never completes the task
        engine.logTaskProgress(id, 10)
        assertEquals(35, engine.dayListView().entries.first { it.taskId == id }.progressMinutesToday)
        assertFalse(taskCompletedOnDate(engine.state, engine.state.tasks.first { it.id == id }, "2026-06-01"))

        // undo rewinds the last log only
        engine.undoChange()
        assertEquals(25, engine.dayListView().entries.first { it.taskId == id }.progressMinutesToday)

        // non-positive minutes are a silent no-op
        val afterUndo = engine.listChangeHistory().size
        engine.logTaskProgress(id, 0)
        assertEquals(afterUndo, engine.listChangeHistory().size)
    }

    @Test
    fun `the habit strip view carries logged progress too`() {
        engine.updateTask("task_back_rehab", TaskPatch(habit = true))
        engine.logTaskProgress("task_back_rehab", 5)
        val habit = engine.dayListView().habits.first { it.taskId == "task_back_rehab" }
        assertEquals(5, habit.progressMinutesToday)
        assertFalse(habit.completedToday)
    }

    @Test
    fun `tags round-trip through updateTask trimmed and blank-filtered, all-blank clears`() {
        val id = engine.createTask(TaskPatch(title = "Tag me"))
        engine.updateTask(id, TaskPatch(tags = listOf(" home ", "", "deep work ")))
        assertEquals(listOf("home", "deep work"), engine.state.tasks.first { it.id == id }.tags)

        engine.updateTask(id, TaskPatch(tags = listOf(" ", "")))
        assertNull(engine.state.tasks.first { it.id == id }.tags)
    }

    @Test
    fun `sheet save syncs the day-list pin with scheduledTime as one change - empty clears both`() {
        val id = engine.createTask(TaskPatch(title = "Pin me", effortMinutes = 20))
        engine.dayListView()
        engine.addTaskToDayList(id)
        val baseline = engine.listChangeHistory().size

        engine.updateTask(id, TaskPatch(scheduledTime = "14:30"), syncPinDate = "2026-06-01")
        assertEquals(baseline + 1, engine.listChangeHistory().size) // ONE undoable change
        assertEquals("14:30", engine.state.tasks.first { it.id == id }.scheduledTime)
        assertEquals("14:30", engine.dayListView().entries.first { it.taskId == id }.pinnedTime)

        engine.updateTask(id, TaskPatch(scheduledTime = ""), syncPinDate = "2026-06-01")
        assertNull(engine.state.tasks.first { it.id == id }.scheduledTime)
        assertNull(engine.dayListView().entries.first { it.taskId == id }.pinnedTime)

        // undo restores BOTH halves of the cleared pin (it was one change)
        engine.undoChange()
        assertEquals("14:30", engine.state.tasks.first { it.id == id }.scheduledTime)
        assertEquals("14:30", engine.dayListView().entries.first { it.taskId == id }.pinnedTime)
    }

    @Test
    fun `habit toggle moves the task between list and strip on the next morning build`() {
        // task_back_rehab is daily recurring: on the list while the habit flag is unset
        assertTrue(engine.dayListView().entries.any { it.taskId == "task_back_rehab" })

        engine.updateTask("task_back_rehab", TaskPatch(habit = true))
        engine.advanceDay() // 2026-06-02: fresh morning build
        val day2 = engine.dayListView()
        assertFalse(day2.entries.any { it.taskId == "task_back_rehab" })
        assertTrue(day2.habits.any { it.taskId == "task_back_rehab" })

        engine.updateTask("task_back_rehab", TaskPatch(habit = false))
        engine.advanceDay() // 2026-06-03
        val day3 = engine.dayListView()
        assertTrue(day3.entries.any { it.taskId == "task_back_rehab" })
        assertFalse(day3.habits.any { it.taskId == "task_back_rehab" })
    }

    @Test
    fun `a no-op save records nothing`() {
        val id = engine.createTask(TaskPatch(title = "Stable", effortMinutes = 30))
        val baseline = engine.listChangeHistory().size

        engine.updateTask(id, TaskPatch()) // empty patch
        engine.updateTask(id, TaskPatch(title = "Stable", effortMinutes = 30)) // same values
        engine.updateTask(id, TaskPatch(scheduledTime = ""), syncPinDate = "2026-06-01") // clearing an unset pin
        engine.updateTask(id, TaskPatch(dueDate = "junk")) // invalid value: withheld, not applied

        assertEquals(baseline, engine.listChangeHistory().size)
        assertEquals("Stable", engine.state.tasks.first { it.id == id }.title)
    }
}
