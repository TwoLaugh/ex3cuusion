package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.model.FolderBlockSelection
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Live-dogfooding batch (2026-06-12): time-at-capture through the engine (the deterministic
// parser pins scheduledTime + entry pinnedTime inside instantCapture's ONE undoable change)
// and deleteTask (the hard remove, distinct from archive and releaseTask).
class CaptureTimeAndDeleteTest {

    // --- time at capture ------------------------------------------------------------------------

    @Test
    fun `capture with a time token pins task and entry in one undoable change`() {
        val engine = testEngine() // clock 2026-06-01 08:30
        val historyBefore = engine.listChangeHistory().size
        val taskId = engine.instantCaptureToDayList("Dentist 6:30pm")!!

        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("Dentist", task.title) // token stripped, title tidied
        assertEquals("18:30", task.scheduledTime)
        assertEquals("2026-06-01", task.scheduledDate) // the target date
        assertEquals(PressureLevel.Scheduled, task.plannerFields.pressureLevel)
        val entry = findDayList(engine.state, "2026-06-01")!!.entries.first { it.taskId == taskId }
        assertEquals("18:30", entry.pinnedTime)
        assertEquals(historyBefore + 1, engine.listChangeHistory().size) // ONE change
        assertEquals("Captured \"Dentist\" to today's list", engine.listChangeHistory().first().summary)

        engine.undoChange() // the single undo removes the task AND its pinned entry
        assertTrue(engine.state.tasks.none { it.id == taskId })
        assertTrue(findDayList(engine.state, "2026-06-01")!!.entries.none { it.taskId == taskId })
    }

    @Test
    fun `capture without a token is exactly the old behaviour`() {
        val engine = testEngine()
        val taskId = engine.instantCaptureToDayList("Buy 6 eggs")!!
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("Buy 6 eggs", task.title)
        assertNull(task.scheduledTime)
        assertNull(task.scheduledDate)
        assertEquals(PressureLevel.Soft, task.plannerFields.pressureLevel)
        assertNull(findDayList(engine.state, "2026-06-01")!!.entries.first { it.taskId == taskId }.pinnedTime)
    }

    @Test
    fun `planning-mode capture pins on tomorrow's list with tomorrow's date`() {
        val engine = testEngine()
        val tomorrow = addDays(engine.state.currentDate, 1)
        val taskId = engine.instantCaptureToDayList("Pack gym bag 7am", tomorrow)!!
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("Pack gym bag", task.title)
        assertEquals("07:00", task.scheduledTime)
        assertEquals(tomorrow, task.scheduledDate)
        assertEquals("07:00", findDayList(engine.state, tomorrow)!!.entries.first { it.taskId == taskId }.pinnedTime)
        assertTrue(findDayList(engine.state, engine.state.currentDate)?.entries.orEmpty().none { it.taskId == taskId })
    }

    // --- deleteTask -------------------------------------------------------------------------------

    @Test
    fun `delete removes task, entries, signals and block selections - and is undoable`() {
        val base = seedState()
        val engine = testEngine(
            base.copy(
                folderBlockSelections = listOf(
                    FolderBlockSelection(
                        date = base.currentDate, folderId = "project_diet_app",
                        selectedTaskIds = listOf("task_auth_bug", "task_optimizer_tests"),
                        updatedAt = "2026-06-01T08:00:00.000Z"
                    )
                )
            )
        )
        // put it on today AND tomorrow, via the tray so a tray signal exists
        engine.addTaskToDayList("task_auth_bug", DayListSource.Tray)
        engine.addTaskToDayList("task_auth_bug", DayListSource.Tray, addDays(engine.state.currentDate, 1))
        assertNotNull(findTraySignal(engine.state, "task_auth_bug"))
        val beforeDelete = engine.state

        engine.deleteTask("task_auth_bug")
        assertTrue(engine.state.tasks.none { it.id == "task_auth_bug" })
        for (list in engine.state.dayLists) {
            assertTrue(list.entries.none { it.taskId == "task_auth_bug" })
            assertEquals(list.entries.indices.toList(), list.entries.map { it.order }) // re-normalized
        }
        assertNull(findTraySignal(engine.state, "task_auth_bug"))
        assertEquals(
            listOf("task_optimizer_tests"),
            engine.state.folderBlockSelections.single().selectedTaskIds
        )
        assertEquals("Deleted \"Finish auth bug\"", engine.listChangeHistory().first().summary)

        engine.undoChange() // everything comes back exactly
        assertEquals(beforeDelete, engine.state)
        assertNotNull(findTraySignal(engine.state, "task_auth_bug"))
    }

    @Test
    fun `deleting the running-timer task clears the timer`() {
        val engine = testEngine()
        engine.addTaskToDayList("task_auth_bug", DayListSource.Manual)
        engine.startTaskTimer("task_auth_bug")
        assertEquals("task_auth_bug", engine.state.activeTimer?.taskId)

        engine.deleteTask("task_auth_bug")
        assertNull(engine.state.activeTimer) // no timer pointing at a ghost
        assertTrue(engine.state.tasks.none { it.id == "task_auth_bug" })

        // a timer on ANOTHER task survives a delete
        engine.startTaskTimer("task_optimizer_tests")
        engine.deleteTask("task_message_will")
        assertEquals("task_optimizer_tests", engine.state.activeTimer?.taskId)
    }

    @Test
    fun `delete is distinct from archive - archived tasks stay in state`() {
        val engine = testEngine()
        engine.archiveTask("task_clean_garage")
        assertTrue(engine.state.tasks.any { it.id == "task_clean_garage" }) // archive keeps it
        engine.deleteTask("task_clean_garage")
        assertTrue(engine.state.tasks.none { it.id == "task_clean_garage" }) // delete does not
    }
}
