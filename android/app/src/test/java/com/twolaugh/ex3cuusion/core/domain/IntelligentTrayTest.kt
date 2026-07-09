package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.Strictness
import com.twolaugh.ex3cuusion.core.model.TrayOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// Port of the "intelligent tray (T093)" suite in src/lib/day-list.test.ts — telemetry, TMT
// ranking, acceptance damping with a hard resurfacing floor, gap fit, spaced someday
// resurfacing, the aging question, and calibrated capacity.
class IntelligentTrayTest {

    private lateinit var engine: DomainEngine

    @Before
    fun setUp() {
        engine = testEngine()
        engine.setClock("2026-06-01", "08:30")
    }

    // Empty the seed backlog so a test fully controls the candidate pool. Back rehab (recurring,
    // auto-listed) and Read together (suggestion -> balance tray only) stay.
    private fun archiveSeedBacklog() {
        for (id in listOf("task_auth_bug", "task_optimizer_tests", "task_message_will", "task_clean_garage")) {
            engine.archiveTask(id)
        }
    }

    @Test
    fun `floor - a task unsurfaced for 7 days gets a guaranteed backlog slot over higher-ranked work`() {
        val weakId = engine.createTask(TaskPatch(title = "Weak but alive", priority = 1, importance = 1, urgency = 1, effortMinutes = 45))
        // 2026-06-01: pool = 4 seed backlog tasks + this one = exactly 5 -> everything surfaces once.
        assertTrue(engine.dayListView().tray.backlog.any { it.taskId == weakId })

        // Five strong competitors arrive; on rank alone the weak task would now stay buried forever.
        repeat(5) { i ->
            engine.createTask(TaskPatch(title = "Strong $i", priority = 9, importance = 9, urgency = 9, effortMinutes = 20, definitionOfDone = "Done."))
        }
        val presence = mutableMapOf<String, Boolean>()
        repeat(7) {
            engine.advanceDay() // 06-02 .. 06-08, one tray read per day
            val view = engine.dayListView()
            presence[view.date] = view.tray.backlog.any { it.taskId == weakId }
        }
        assertEquals(false, presence["2026-06-02"]) // outranked all week...
        assertEquals(false, presence["2026-06-04"])
        assertEquals(false, presence["2026-06-07"]) // ...even at 6 days unsurfaced
        assertEquals(true, presence["2026-06-08"]) // the 7-day floor overrides rank and damping
    }

    @Test
    fun `acceptance damping - repeated ignoring lowers a task's tray rank but never removes it`() {
        archiveSeedBacklog()
        val keenId = engine.createTask(TaskPatch(title = "Keen", priority = 3, importance = 3, urgency = 3, effortMinutes = 20))
        val ignoredId = engine.createTask(TaskPatch(title = "Ignored", priority = 6, importance = 6, urgency = 6, effortMinutes = 20))

        var backlog = engine.dayListView().tray.backlog
        assertEquals(ignoredId, backlog.firstOrNull()?.taskId) // higher base rank leads on day one

        // The user keeps pulling Keen onto the list (add resets the streak; eject is information,
        // not ignoring) and never touches Ignored, whose ignore streak grows daily.
        repeat(5) {
            engine.addTaskToDayList(keenId)
            engine.removeTaskFromDayList(keenId)
            engine.advanceDay()
            backlog = engine.dayListView().tray.backlog
        }
        assertEquals(keenId, backlog.firstOrNull()?.taskId) // streak-5 damping (x0.4) flipped the order
        assertTrue(backlog.any { it.taskId == ignoredId }) // dampened, never suppressed
    }

    @Test
    fun `suggestSplit flags big-vague backlog tasks not small or well-defined ones`() {
        archiveSeedBacklog()
        val vagueId = engine.createTask(TaskPatch(title = "Sort out the whole garden", effortMinutes = 120))
        val definedId = engine.createTask(TaskPatch(title = "Big but defined", effortMinutes = 120, definitionOfDone = "Beds weeded and edged."))
        val smallId = engine.createTask(TaskPatch(title = "Water the plants", effortMinutes = 10))

        val backlog = engine.dayListView().tray.backlog
        assertEquals(true, backlog.find { it.taskId == vagueId }?.suggestSplit)
        assertEquals(false, backlog.find { it.taskId == definedId }?.suggestSplit)
        assertEquals(false, backlog.find { it.taskId == smallId }?.suggestSplit)
    }

    @Test
    fun `avoidance - a run of tiny completions while big work idles lifts small clear tasks over big vague ones`() {
        archiveSeedBacklog()
        val bigVagueId = engine.createTask(
            TaskPatch(title = "Rebuild the shed", priority = 9, importance = 9, urgency = 9, strictness = Strictness.Strict, effortMinutes = 120)
        )
        val smallClearId = engine.createTask(TaskPatch(title = "File one receipt", priority = 4, importance = 4, urgency = 4, effortMinutes = 15))

        var backlog = engine.dayListView().tray.backlog
        assertTrue(backlog.indexOfFirst { it.taskId == bigVagueId } < backlog.indexOfFirst { it.taskId == smallClearId })

        // Three <= 15m completions in the 3-day window while the 120m task sits untouched.
        repeat(3) { i ->
            engine.completeTaskDirect(engine.createTask(TaskPatch(title = "Tiny $i", effortMinutes = 10)))
        }
        backlog = engine.dayListView().tray.backlog
        assertTrue(backlog.indexOfFirst { it.taskId == smallClearId } < backlog.indexOfFirst { it.taskId == bigVagueId })
    }

    @Test
    fun `gap-aware - gapMinutes runs to the next pinned anchor and rows report fitsGap`() {
        archiveSeedBacklog()
        val fitsId = engine.createTask(TaskPatch(title = "Quick fix", effortMinutes = 45))
        val tooBigId = engine.createTask(TaskPatch(title = "Long session", effortMinutes = 90))

        var view = engine.dayListView()
        assertEquals(840, view.tray.gapMinutes) // no pins: 08:30 -> end of evening 22:30

        engine.setDayListPin("task_back_rehab", "09:30") // anchor in 60 minutes
        view = engine.dayListView()
        assertEquals(60, view.tray.gapMinutes)
        assertEquals(true, view.tray.backlog.find { it.taskId == fitsId }?.fitsGap)
        assertEquals(false, view.tray.backlog.find { it.taskId == tooBigId }?.fitsGap)
    }

    @Test
    fun `someday - excluded from the backlog except on the spaced 7-14-30-90 schedule`() {
        archiveSeedBacklog()
        val somedayId = engine.createTask(TaskPatch(title = "Learn the accordion", effortMinutes = 60))
        engine.dayListView() // surfaces it once
        engine.resolveStaleTask(somedayId, StaleResolution.Someday) // demoted: quiet, schedule anchored today
        assertEquals(DateIntentKind.Someday, engine.state.tasks.find { it.id == somedayId }?.dateIntent?.kind)
        assertFalse(engine.dayListView().tray.backlog.any { it.taskId == somedayId })

        engine.setClock("2026-06-04", "08:30") // mid-window: still quiet
        assertFalse(engine.dayListView().tray.backlog.any { it.taskId == somedayId })

        engine.setClock("2026-06-08", "08:30") // 7 days after the demotion: resurfaces, tagged
        assertEquals(true, engine.dayListView().tray.backlog.find { it.taskId == somedayId }?.resurfaced)

        engine.setClock("2026-06-09", "08:30") // the next interval is 14 days: quiet again
        assertFalse(engine.dayListView().tray.backlog.any { it.taskId == somedayId })
    }

    @Test
    fun `aging - 5 ignored surfacings raise staleQuestion - resolveStaleTask keep clears it and is undoable`() {
        archiveSeedBacklog()
        val lingerId = engine.createTask(TaskPatch(title = "Linger", effortMinutes = 30))
        repeat(4) {
            engine.dayListView() // surfaced and ignored on 06-01 .. 06-04
            engine.advanceDay()
        }
        var row = engine.dayListView().tray.backlog.find { it.taskId == lingerId } // 5th surfacing
        assertEquals(true, row?.staleQuestion) // a QUESTION, never an automatic archive

        val baseline = engine.listChangeHistory().size
        engine.resolveStaleTask(lingerId, StaleResolution.Keep)
        assertEquals(baseline + 1, engine.listChangeHistory().size)
        row = engine.dayListView().tray.backlog.find { it.taskId == lingerId }
        assertEquals(false, row?.staleQuestion) // streak cleared, task stays in the rotation

        engine.undoChange()
        row = engine.dayListView().tray.backlog.find { it.taskId == lingerId }
        assertEquals(true, row?.staleQuestion) // the resolution rewinds like any list mutation
    }

    @Test
    fun `calibration - gauges use the folder's actual-estimate ratio once it has 3 samples`() {
        val sampleIds = (0..2).map { engine.createTask(TaskPatch(title = "House job $it", folderId = "domain_house", effortMinutes = 30)) }
        val plannedId = engine.createTask(TaskPatch(title = "Fix the gate", folderId = "domain_house", effortMinutes = 30))
        val trayHouseId = engine.createTask(TaskPatch(title = "Oil the hinges", folderId = "domain_house", effortMinutes = 40))
        engine.dayListView() // materialize the morning list first
        for (id in sampleIds) engine.completeTaskDirect(id, 60) // every 30m estimate ran 60m: ratio 2.0

        engine.addTaskToDayList(plannedId)
        val view = engine.dayListView()
        assertEquals(50, view.gauges.listMinutes) // Back rehab 20 + gate 30, raw estimates
        // House ratio 2.0 reprices the gate; Back rehab's folder has no samples -> global fallback 2.0.
        assertEquals(100, view.gauges.calibratedListMinutes)
        assertEquals(2.0, view.tray.backlog.find { it.taskId == trayHouseId }?.calibrationRatio)
    }

    @Test
    fun `tray signals are idempotent on a same-date double read and the tray stays stable`() {
        val first = engine.dayListView()
        val signalsAfterFirst = engine.state.traySignals
        val second = engine.dayListView()
        assertEquals(signalsAfterFirst, engine.state.traySignals) // no growth on a re-read
        assertEquals(first.tray.backlog.map { it.taskId }, second.tray.backlog.map { it.taskId })
        val surfaced = signalsAfterFirst.find { it.taskId == first.tray.backlog.firstOrNull()?.taskId }
        assertEquals(1, surfaced?.surfacedCount)
        assertEquals(1, surfaced?.ignoredStreak)
        assertEquals("2026-06-01", surfaced?.firstSurfacedDate)
        assertEquals("2026-06-01", surfaced?.lastSurfacedDate)
        assertEquals(TrayOutcome.Ignored, surfaced?.lastOutcome)
    }
}
