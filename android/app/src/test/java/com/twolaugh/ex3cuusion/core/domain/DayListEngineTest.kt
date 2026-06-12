package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.Carryover
import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// Port of the "day list (T092)" suite in src/lib/day-list.test.ts (7 of its 8 tests; the 8th,
// AI enrichment of a capture, is T105 scope — the Android core has no interpreter yet). Seed
// baseline on 2026-06-01 (a Monday): the only auto-added entry is the daily "Back rehab"
// recurring task; "Read together" is a keep_as_suggestion and is not due on Mondays anyway.
class DayListEngineTest {

    private lateinit var engine: DomainEngine

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock("2026-06-01", "08:30")
    }

    @Test
    fun `morning build auto-adds due recurring and dated-today tasks - habits live on the strip not the list`() {
        val stretchId = engine.createTask(
            TaskPatch(
                title = "Stretch daily", effortMinutes = 10,
                repeatPolicy = RepeatPolicy.Daily(carryover = Carryover.Skip),
                completionBehavior = CompletionBehavior.Repeatable
            )
        )
        val datedId = engine.createTask(TaskPatch(title = "Dated today", scheduledDate = "2026-06-01", scheduledTime = "14:00", effortMinutes = 20))
        engine.updateTask("task_back_rehab", TaskPatch(habit = true))

        val view = engine.dayListView()
        assertEquals(DayListSource.Recurring, view.entries.find { it.taskId == stretchId }?.source)
        assertEquals(DayListSource.Manual, view.entries.find { it.taskId == datedId }?.source)
        // pinnedTime carried from scheduledTime on a today-scheduled task
        assertEquals("14:00", view.entries.find { it.taskId == datedId }?.pinnedTime)
        // The habit task is excluded from the list but present on the habit strip.
        assertFalse(view.entries.any { it.taskId == "task_back_rehab" })
        assertTrue(view.habits.any { it.taskId == "task_back_rehab" })

        // T090 principle holds: a task created AFTER the first view never barges into the list.
        val lateId = engine.createTask(TaskPatch(title = "Latecomer", scheduledDate = "2026-06-01", effortMinutes = 10))
        assertFalse(engine.dayListView().entries.any { it.taskId == lateId })
    }

    @Test
    fun `carries unfinished manual entries to the next day's list and drops completed ones`() {
        val carryId = engine.createTask(TaskPatch(title = "Carry me", effortMinutes = 15))
        val doneId = engine.createTask(TaskPatch(title = "Done me", effortMinutes = 15))
        engine.dayListView() // materialize 2026-06-01
        engine.addTaskToDayList(carryId)
        engine.addTaskToDayList(doneId)
        engine.completeTaskDirect(doneId)

        engine.advanceDay() // 2026-06-02
        val view = engine.dayListView()
        assertEquals(DayListSource.Carried, view.entries.find { it.taskId == carryId }?.source)
        assertFalse(view.entries.any { it.taskId == doneId })
        // Recurring entries are rebuilt fresh (source "recurring"), not carried.
        assertEquals(DayListSource.Recurring, view.entries.find { it.taskId == "task_back_rehab" }?.source)
    }

    @Test
    fun `add remove reorder and pin are undoable and idempotent`() {
        val id = engine.createTask(TaskPatch(title = "Tray me", effortMinutes = 10))
        engine.dayListView() // silent morning build — creates no history
        val baseline = engine.listChangeHistory().size

        engine.addTaskToDayList(id)
        assertEquals(DayListSource.Tray, engine.dayListView().entries.find { it.taskId == id }?.source)
        assertEquals(baseline + 1, engine.listChangeHistory().size)
        engine.addTaskToDayList(id) // idempotent: no duplicate entry, no history noise
        assertEquals(1, engine.dayListView().entries.count { it.taskId == id })
        assertEquals(baseline + 1, engine.listChangeHistory().size)

        engine.setDayListPin(id, "09:15")
        assertEquals("09:15", engine.dayListView().entries.find { it.taskId == id }?.pinnedTime)
        assertEquals(baseline + 2, engine.listChangeHistory().size)
        engine.setDayListPin(id, "9:15") // invalid HH:MM rejected silently
        assertEquals("09:15", engine.dayListView().entries.find { it.taskId == id }?.pinnedTime)
        assertEquals(baseline + 2, engine.listChangeHistory().size)

        engine.reorderDayList(listOf(id, "task_back_rehab"))
        assertEquals(id, engine.dayListView().entries.firstOrNull()?.taskId)
        assertEquals(baseline + 3, engine.listChangeHistory().size)
        engine.reorderDayList(listOf("unknown_task", id, "task_back_rehab")) // unknown ignored -> same order -> no-op
        assertEquals(id, engine.dayListView().entries.firstOrNull()?.taskId)
        assertEquals(baseline + 3, engine.listChangeHistory().size)

        engine.removeTaskFromDayList(id)
        assertFalse(engine.dayListView().entries.any { it.taskId == id })
        assertEquals(TaskStatus.Active, engine.state.tasks.find { it.id == id }?.status) // task untouched
        assertEquals(baseline + 4, engine.listChangeHistory().size)
        engine.removeTaskFromDayList(id) // idempotent
        assertEquals(baseline + 4, engine.listChangeHistory().size)

        engine.undoChange() // undo the remove: entry returns with its pin and position intact
        val restored = engine.dayListView()
        assertEquals(id, restored.entries.firstOrNull()?.taskId)
        assertEquals("09:15", restored.entries.firstOrNull()?.pinnedTime)
    }

    @Test
    fun `tray - due excludes list members - balance surfaces a missing pillar's suggestion`() {
        val dueId = engine.createTask(TaskPatch(title = "Due thing", dueDate = "2026-06-01", effortMinutes = 15))
        val ideaId = engine.createTask(
            TaskPatch(title = "Call gran ideas", folderId = "domain_social", completionBehavior = CompletionBehavior.KeepAsSuggestion, effortMinutes = 15)
        )

        var view = engine.dayListView()
        assertTrue(view.entries.any { it.taskId == dueId }) // due today -> auto-added
        assertFalse(view.tray.due.any { it.taskId == dueId }) // on the list -> not in the tray

        engine.removeTaskFromDayList(dueId)
        view = engine.dayListView()
        assertTrue(view.tray.due.any { it.taskId == dueId }) // removed -> back in the due tray

        // No social task on the list -> the Social Maintenance pillar is missing and its suggestion is offered.
        assertTrue(view.gauges.missingPillars.contains("Social Maintenance"))
        val balanceIdea = view.tray.balance.find { it.taskId == ideaId }
        assertNotNull(balanceIdea)
        assertEquals("Social Maintenance", balanceIdea?.pillarName)

        // Backlog ranks plannable non-due work and never includes list members or suggestions.
        assertTrue(view.tray.backlog.size <= 5)
        assertTrue(view.tray.backlog.any { it.taskId == "task_auth_bug" })
        assertFalse(view.tray.backlog.any { it.taskId == ideaId })
        assertFalse(view.tray.backlog.any { row -> view.entries.any { it.taskId == row.taskId } })
    }

    @Test
    fun `gauges - listMinutes counts only unticked entries and capacity is present`() {
        val bigId = engine.createTask(TaskPatch(title = "Big task", scheduledDate = "2026-06-01", effortMinutes = 60))

        var view = engine.dayListView() // Back rehab (20m) + Big task (60m)
        assertEquals(80, view.gauges.listMinutes)
        assertTrue(view.gauges.capacityMinutes > 0)

        engine.completeTaskDirect(bigId)
        view = engine.dayListView()
        assertEquals(20, view.gauges.listMinutes) // completed entry no longer counts
        assertEquals(true, view.entries.find { it.taskId == bigId }?.completedToday)

        // Pillar balance covers list + habits, completed included, with shares summing to 1.
        val total = view.gauges.balance.sumOf { it.share }
        assertEquals(1.0, total, 1e-5)
        assertTrue(view.gauges.balance.any { it.name == "Health Repair" })
    }

    @Test
    fun `habit streak counts consecutive completed days and resets after a gap`() {
        val flossId = engine.createTask(
            TaskPatch(
                title = "Floss", effortMinutes = 5, habit = true,
                repeatPolicy = RepeatPolicy.Daily(carryover = Carryover.Skip),
                completionBehavior = CompletionBehavior.Repeatable
            )
        )

        engine.completeTaskDirect(flossId) // 06-01
        engine.advanceDay()
        engine.completeTaskDirect(flossId) // 06-02
        engine.advanceDay()
        engine.completeTaskDirect(flossId) // 06-03

        var habit = engine.dayListView().habits.find { it.taskId == flossId }
        assertEquals(true, habit?.completedToday)
        assertEquals(3, habit?.streak)

        engine.advanceDay() // 06-04 skipped
        engine.advanceDay() // 06-05
        engine.completeTaskDirect(flossId)
        habit = engine.dayListView().habits.find { it.taskId == flossId }
        assertEquals(1, habit?.streak) // the gap reset the streak

        // Un-ticking today removes the completion again (toggle), keeping the task repeatable.
        engine.completeTaskDirect(flossId)
        habit = engine.dayListView().habits.find { it.taskId == flossId }
        assertEquals(false, habit?.completedToday)
        assertEquals(TaskStatus.Active, engine.state.tasks.find { it.id == flossId }?.status)
    }

    @Test
    fun `instant capture creates the task and the list entry as one undoable change`() {
        engine.dayListView() // morning build happens silently before the capture
        val baseline = engine.listChangeHistory().size

        val taskId = engine.instantCaptureToDayList("Buy milk")
        assertNotNull(taskId)
        val task = engine.state.tasks.find { it.id == taskId }
        assertEquals("Buy milk", task?.title)
        assertEquals(30, task?.effortMinutes)
        assertEquals(5, task?.priority)
        assertEquals("manual", task?.source)
        assertNull(task?.folderId)
        assertEquals(DayListSource.Manual, engine.dayListView().entries.find { it.taskId == taskId }?.source)
        assertEquals(baseline + 1, engine.listChangeHistory().size)

        engine.undoChange()
        assertFalse(engine.state.tasks.any { it.id == taskId })
        assertFalse(engine.dayListView().entries.any { it.taskId == taskId })
    }

    // --- day shape (product-definition: "CAPACITY AND BALANCE ARE ONE IDEA") ---------------------

    @Test
    fun `day shape - intent shares normalize pillar weights and a lone pillar falls back to share one`() {
        // seed pillar weights: 10, 9, 8, 5, 4 (sum 36), in folder order
        val shares = engine.dayListView().gauges.intentShares
        assertEquals(5, shares.size)
        assertEquals(10.0 / 36.0, shares.first { it.name == "Health Repair" }.share, 1e-9)
        assertEquals(4.0 / 36.0, shares.first { it.name == "Social Maintenance" }.share, 1e-9)
        assertEquals(1.0, shares.sumOf { it.share }, 1e-9)

        // First-run Personal-only state: one pillar, no weight set (defaults to 5) -> share 1.0
        val lone = dayShapeIntents(listOf(Folder(id = "domain_personal", name = "Personal")))
        assertEquals(1, lone.size)
        assertEquals(1.0, lone[0].share, 1e-9)
    }

    @Test
    fun `day shape - loose tolerance keeps severity none inside and the single nudge is the largest under-deviation`() {
        val intents = listOf(
            DayShapeIntent("a", "Alpha", 0.4),
            DayShapeIntent("b", "Beta", 0.3),
            DayShapeIntent("c", "Gamma", 0.2),
            DayShapeIntent("d", "Delta", 0.1)
        )
        val actual = listOf(
            DayListPillarShare("a", "Alpha", minutes = 200, share = 0.0),
            DayListPillarShare("b", "Beta", minutes = 30, share = 0.0),
            DayListPillarShare("d", "Delta", minutes = 400, share = 0.0)
            // Gamma absent: no minutes today
        )
        val deviations = dayShapeDeviations(intents, actual, capacityMinutes = 600)
        // Alpha: intent 240, actual 200 -> |40| <= max(45m, 50% of 240) -> none (a workday is
        // legitimately work-heavy; the tolerance is loose by design)
        assertEquals(DayShapeSeverity.None, deviations.first { it.folderId == "a" }.severity)
        // Beta: intent 180, actual 30 -> 150 > max(45, 90) -> under
        assertEquals(DayShapeSeverity.Under, deviations.first { it.folderId == "b" }.severity)
        // Gamma: intent 120, actual 0 -> 120 > max(45, 60) -> under
        assertEquals(DayShapeSeverity.Under, deviations.first { it.folderId == "c" }.severity)
        // Delta: intent 60, actual 400 -> over
        assertEquals(DayShapeSeverity.Over, deviations.first { it.folderId == "d" }.severity)

        // The nudge: AT MOST ONE — the largest under-deviation (Beta's 150m gap beats Gamma's
        // 120m); over-deviations never nudge.
        val gauges = DayListGauges(
            capacityMinutes = 600, listMinutes = 0, calibratedListMinutes = 0,
            balance = actual, missingPillars = emptyList(),
            intentShares = intents, deviations = deviations
        )
        assertEquals("b", dayShapeNudge(gauges)?.folderId)

        // Everything inside tolerance -> no nudge at all.
        val quiet = dayShapeDeviations(intents, listOf(
            DayListPillarShare("a", "Alpha", minutes = 240, share = 0.0),
            DayListPillarShare("b", "Beta", minutes = 150, share = 0.0),
            DayListPillarShare("c", "Gamma", minutes = 80, share = 0.0),
            DayListPillarShare("d", "Delta", minutes = 60, share = 0.0)
        ), capacityMinutes = 600)
        assertTrue(quiet.all { it.severity == DayShapeSeverity.None })
        assertNull(dayShapeNudge(gauges.copy(deviations = quiet)))
    }

    @Test
    fun `day shape - intent minutes scale with the render window - today remainder vs planning full day`() {
        engine.setClock("2026-06-01", "20:00")
        val today = engine.dayListView()
        val tomorrow = engine.dayListView("2026-06-02")
        // today = the window remainder (20:00 -> 23:00); a planning date = the full window
        assertEquals(180, today.gauges.capacityMinutes)
        assertEquals(900, tomorrow.gauges.capacityMinutes)
        val healthShare = today.gauges.intentShares.first { it.name == "Health Repair" }.share
        assertEquals(
            (healthShare * 180).roundToInt(),
            today.gauges.deviations.first { it.name == "Health Repair" }.intentMinutes
        )
        assertEquals(
            (healthShare * 900).roundToInt(),
            tomorrow.gauges.deviations.first { it.name == "Health Repair" }.intentMinutes
        )
    }

    @Test
    fun `day shape - the payload is additive and deviations cover every intent pillar`() {
        val gauges = engine.dayListView().gauges
        // existing gauge fields are untouched by the day-shape addition
        assertTrue(gauges.capacityMinutes > 0)
        assertTrue(gauges.balance.isNotEmpty())
        assertTrue(gauges.missingPillars.isNotEmpty()) // kept for compat
        // one deviation per intent pillar, intent = share x capacity, actual mirrors balance
        assertEquals(gauges.intentShares.size, gauges.deviations.size)
        val actualById = gauges.balance.associateBy { it.folderId }
        gauges.intentShares.zip(gauges.deviations).forEach { (intent, deviation) ->
            assertEquals(intent.folderId, deviation.folderId)
            assertEquals((intent.share * gauges.capacityMinutes).roundToInt(), deviation.intentMinutes)
            assertEquals(actualById[deviation.folderId]?.minutes ?: 0, deviation.actualMinutes)
        }
    }
}
