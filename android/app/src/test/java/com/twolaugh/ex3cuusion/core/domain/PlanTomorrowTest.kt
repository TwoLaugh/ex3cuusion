package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.DayListSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// T110 — plan tomorrow (the evening ritual): date-aware day lists. Building/mutating a FUTURE
// date's list rides the exact same engine paths as today (every mutation takes a date defaulting
// to today), with three deliberate differences: gauges use the full-day capacity baseline, tray
// telemetry is never written for a future date, and the first access of a planned-ahead date
// runs a one-shot reconcile instead of returning the stored list as-is.
//
// Seed clock: the evening of 2026-06-01 (a Monday). Tomorrow, 2026-06-02 (Tuesday), has the
// daily "Back rehab" recurring task due and "Message Will" hitting its 06-02 deadline.
class PlanTomorrowTest {

    private lateinit var engine: DomainEngine

    private val today = "2026-06-01"
    private val tomorrow = "2026-06-02"

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock(today, "19:30")
    }

    @Test
    fun `plan-ahead build for tomorrow - due recurring plus dated-tomorrow plus live carryover of today's unfinished`() {
        val carryId = engine.createTask(TaskPatch(title = "Carry me", effortMinutes = 15))
        val doneId = engine.createTask(TaskPatch(title = "Done tonight", effortMinutes = 15))
        engine.dayListView() // materialize today
        engine.addTaskToDayList(carryId)
        engine.addTaskToDayList(doneId)
        engine.completeTaskDirect(doneId)

        val view = engine.dayListView(tomorrow)
        assertEquals(tomorrow, view.date)
        // due recurring for tomorrow + the task whose deadline is tomorrow
        assertEquals(DayListSource.Recurring, view.entries.find { it.taskId == "task_back_rehab" }?.source)
        assertTrue(view.entries.any { it.taskId == "task_message_will" })
        // live carryover preview: today's unfinished carries (count 1); completed-today does not
        val carried = view.entries.find { it.taskId == carryId }
        assertEquals(DayListSource.Carried, carried?.source)
        assertEquals(1, carried?.carriedCount)
        assertFalse(view.entries.any { it.taskId == doneId })
        // the plan-ahead build never touches today's stored list
        assertTrue(findDayList(engine.state, today)!!.entries.any { it.taskId == doneId })
    }

    @Test
    fun `mutations on tomorrow leave today's list untouched - and vice versa`() {
        val xId = engine.createTask(TaskPatch(title = "Cross-check", effortMinutes = 10))
        engine.dayListView()
        engine.dayListView(tomorrow)

        engine.addTaskToDayList(xId, DayListSource.Tray, tomorrow)
        assertTrue(engine.dayListView(tomorrow).entries.any { it.taskId == xId })
        assertFalse(engine.dayListView().entries.any { it.taskId == xId })

        engine.reorderDayList(listOf(xId, "task_message_will", "task_back_rehab"), tomorrow)
        assertEquals(xId, engine.dayListView(tomorrow).entries.first().taskId)
        assertEquals("task_back_rehab", engine.dayListView().entries.first().taskId) // today untouched

        engine.setDayListPin("task_message_will", "09:00", tomorrow)
        assertEquals(
            "09:00",
            engine.dayListView(tomorrow).entries.find { it.taskId == "task_message_will" }?.pinnedTime
        )

        // the other direction: today's add/remove never reaches tomorrow's list
        engine.addTaskToDayList(xId)
        engine.removeTaskFromDayList(xId)
        assertFalse(engine.dayListView().entries.any { it.taskId == xId })
        assertTrue(engine.dayListView(tomorrow).entries.any { it.taskId == xId })
    }

    @Test
    fun `instant capture to tomorrow lands on tomorrow's list only`() {
        engine.dayListView()
        val captured = engine.instantCaptureToDayList("Pack gym bag", tomorrow)
        assertNotNull(captured)
        assertEquals(
            DayListSource.Manual,
            engine.dayListView(tomorrow).entries.find { it.taskId == captured }?.source
        )
        assertFalse(engine.dayListView().entries.any { it.taskId == captured })
        assertTrue(engine.listChangeHistory().first().summary.contains("tomorrow's list"))
    }

    @Test
    fun `future-date gauges use the full-day capacity baseline - today stays clock-aware`() {
        engine.setClock(today, "21:30") // 30 evening minutes left
        // today: min(available 300, max(45, 22:00 - 21:30)) -> floor-guarded 90
        assertEquals(90, engine.dayListView().gauges.capacityMinutes)
        // tomorrow has not started: the full availableMinutes baseline, no clock subtraction
        assertEquals(300, engine.dayListView(tomorrow).gauges.capacityMinutes)
    }

    @Test
    fun `midnight reconcile keeps authored order - drops late-completed - appends new carryover at the end`() {
        val carryA = engine.createTask(TaskPatch(title = "Carry A", effortMinutes = 10))
        val lateDone = engine.createTask(TaskPatch(title = "Done late tonight", effortMinutes = 10))
        engine.dayListView()
        engine.addTaskToDayList(carryA)
        engine.addTaskToDayList(lateDone)

        // Tonight's planning: pre-seed tomorrow, capture into it, author an order.
        engine.dayListView(tomorrow)
        val tomorrowOnly = engine.instantCaptureToDayList("Tomorrow only", tomorrow)!!
        engine.reorderDayList(listOf(tomorrowOnly, lateDone, carryA, "task_back_rehab", "task_message_will"), tomorrow)

        // AFTER planning: one planned carryover gets finished late tonight, and new unfinished
        // work lands on today's list that the plan has never seen.
        engine.completeTaskDirect(lateDone)
        val newCarry = engine.createTask(TaskPatch(title = "New carry", effortMinutes = 10))
        engine.addTaskToDayList(newCarry)

        engine.advanceDay() // 2026-06-02 08:30 — first view of the planned date reconciles
        val view = engine.dayListView()
        assertEquals(
            listOf(tomorrowOnly, carryA, "task_back_rehab", "task_message_will", newCarry),
            view.entries.map { it.taskId }
        )
        val appended = view.entries.last()
        assertEquals(DayListSource.Carried, appended.source)
        assertEquals(1, appended.carriedCount)

        // One-shot: committedAt now belongs to the date; the next view changes nothing.
        assertTrue(findDayList(engine.state, tomorrow)!!.committedAt.startsWith(tomorrow))
        assertEquals(view.entries.map { it.taskId }, engine.dayListView().entries.map { it.taskId })
    }

    @Test
    fun `rendering or mutating a future date never moves the tray signals`() {
        engine.dayListView() // today's render stamps today's surfacing telemetry
        val before = engine.state.traySignals

        engine.dayListView(tomorrow) // plan-ahead render: surfacing suppressed
        assertEquals(before, engine.state.traySignals)

        engine.addTaskToDayList("task_auth_bug", DayListSource.Tray, tomorrow) // no acceptance write
        assertEquals(before, engine.state.traySignals)

        engine.removeTaskFromDayList("task_auth_bug", tomorrow) // no eject write
        assertEquals(before, engine.state.traySignals)
    }
}
