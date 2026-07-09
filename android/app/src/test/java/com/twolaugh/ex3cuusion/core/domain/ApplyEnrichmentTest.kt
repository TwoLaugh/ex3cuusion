package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.ai.CaptureRevision
import com.twolaugh.ex3cuusion.core.ai.RevisionDateIntent
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import com.twolaugh.ex3cuusion.core.model.IntentType
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import com.twolaugh.ex3cuusion.core.model.TaskType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// T105: DomainEngine.applyEnrichment — the web's enrichCapturedTask/applyRevisionToTask
// semantics (state.ts) against fake revisions. No network anywhere near these tests.
class ApplyEnrichmentTest {

    private fun fakeRevision(
        shouldApply: Boolean = true,
        confidence: Double = 0.8,
        title: String? = null,
        folderName: String? = null,
        dateIntent: RevisionDateIntent? = null,
        scheduledDate: String? = null,
        scheduledTime: String? = null,
        dueDate: String? = null,
        effortMinutes: Int? = null,
        priority: Int? = null,
        importance: Int? = null,
        urgency: Int? = null,
        definitionOfDone: String? = null,
        note: String? = null
    ) = CaptureRevision(
        summary = "fixture",
        shouldApply = shouldApply,
        confidence = confidence,
        title = title,
        folderName = folderName,
        dateIntent = dateIntent,
        scheduledDate = scheduledDate,
        scheduledTime = scheduledTime,
        dueDate = dueDate,
        effortMinutes = effortMinutes,
        priority = priority,
        importance = importance,
        urgency = urgency,
        definitionOfDone = definitionOfDone,
        note = note,
        changes = listOf("fixture change")
    )

    private fun engineWithCapture(title: String = "Water plants"): Pair<DomainEngine, String> {
        val engine = testEngine()
        val taskId = engine.instantCaptureToDayList(title)!!
        return engine to taskId
    }

    // --- folder resolution (findFolderMention port) ------------------------------------------------

    @Test
    fun `folder by exact name prefers the child when names are duplicated`() {
        // The seed has "Diet App" twice: domain_product (top) and project_diet_app (child).
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(taskId, fakeRevision(folderName = "Diet App"))
        assertNotNull(applied)
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("project_diet_app", task.folderId)
        assertEquals(TaskType.ProjectTask, task.type)
        assertEquals(IntentType.Progress, task.plannerFields.intentType)
        assertEquals(listOf("moved under Diet App"), applied!!.changes)
    }

    @Test
    fun `folder by full path resolves a nested folder case-insensitively`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(taskId, fakeRevision(folderName = "social maintenance / emma"))
        assertNotNull(applied)
        assertEquals("container_emma", engine.state.tasks.first { it.id == taskId }.folderId)
    }

    @Test
    fun `folder by single exact top-level name stays atomic`() {
        val (engine, taskId) = engineWithCapture()
        engine.applyEnrichment(taskId, fakeRevision(folderName = "House Work"))
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("domain_house", task.folderId)
        assertEquals(TaskType.Atomic, task.type)
        assertEquals(IntentType.Obligation, task.plannerFields.intentType)
    }

    @Test
    fun `folder never resolves by substring`() {
        // "Work" appears inside "Job Work" and "House Work" but matches neither exactly.
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(taskId, fakeRevision(folderName = "Work"))
        assertNull(applied) // folder was the only proposed change, and it did not resolve
        assertNull(engine.state.tasks.first { it.id == taskId }.folderId)
    }

    // --- dates, times, pin sync --------------------------------------------------------------------

    @Test
    fun `scheduling today at a clock time pins the day-list entry`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(dateIntent = RevisionDateIntent.Today, scheduledTime = "17:00")
        )
        assertNotNull(applied)
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals(engine.state.currentDate, task.scheduledDate)
        assertEquals("17:00", task.scheduledTime)
        assertEquals(PressureLevel.Scheduled, task.plannerFields.pressureLevel)
        val entry = findDayList(engine.state, engine.state.currentDate)!!.entries.first { it.taskId == taskId }
        assertEquals("17:00", entry.pinnedTime)
    }

    @Test
    fun `enrichment never overrides a capture-set pin`() {
        // "Dentist 6pm" — the deterministic capture parser already pinned 18:00. The model's
        // date/time opinions must change nothing about that pin; other refinements still apply.
        val engine = testEngine()
        val taskId = engine.instantCaptureToDayList("Dentist 6pm")!!
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(
                dateIntent = RevisionDateIntent.Tomorrow,
                scheduledTime = "17:00",
                folderName = "Health Repair",
                effortMinutes = 45
            )
        )
        assertNotNull(applied) // folder + estimate still applied...
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("domain_health", task.folderId)
        assertEquals(45, task.effortMinutes)
        // ...but the capture's pin stands untouched, on the task and on the entry
        assertEquals("18:00", task.scheduledTime)
        assertEquals(engine.state.currentDate, task.scheduledDate)
        val entry = findDayList(engine.state, engine.state.currentDate)!!.entries.first { it.taskId == taskId }
        assertEquals("18:00", entry.pinnedTime)
        assertTrue(applied!!.changes.none { it.startsWith("scheduled") || it.startsWith("moved to") })
    }

    @Test
    fun `deadline intent sets dueDate and clears schedule`() {
        val (engine, taskId) = engineWithCapture()
        engine.applyEnrichment(
            taskId,
            fakeRevision(dateIntent = RevisionDateIntent.Deadline, dueDate = "2026-06-20")
        )
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("2026-06-20", task.dueDate)
        assertNull(task.scheduledDate)
        assertEquals(PressureLevel.Due, task.plannerFields.pressureLevel)
    }

    @Test
    fun `invalid date formats are rejected`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(dateIntent = RevisionDateIntent.SpecificDate, scheduledDate = "June 20th", scheduledTime = "5pm")
        )
        assertNull(applied)
        val task = engine.state.tasks.first { it.id == taskId }
        assertNull(task.scheduledDate)
        assertNull(task.scheduledTime)
    }

    @Test
    fun `next week clears dates into a week window`() {
        val (engine, taskId) = engineWithCapture()
        engine.applyEnrichment(taskId, fakeRevision(dateIntent = RevisionDateIntent.NextWeek))
        val task = engine.state.tasks.first { it.id == taskId }
        assertNull(task.scheduledDate)
        assertNull(task.dueDate)
        // 2026-06-01 is a Monday, so next week is 06-08..06-14.
        assertEquals("2026-06-08", task.dateIntent?.startDate)
        assertEquals("2026-06-14", task.dateIntent?.endDate)
        assertEquals(PressureLevel.Soft, task.plannerFields.pressureLevel)
    }

    // --- clamps ------------------------------------------------------------------------------------

    @Test
    fun `effort and scores clamp to the schema ranges`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(effortMinutes = 9999, priority = 42, importance = 0, urgency = 7)
        )
        assertNotNull(applied)
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals(480, task.effortMinutes)
        assertEquals(9, task.priority)
        assertEquals(1, task.importance)
        assertEquals(7, task.urgency)
        assertEquals(0.8, task.estimateConfidence!!, 1e-9)
        assertTrue(applied!!.changes.contains("set estimate to 480m"))
        assertTrue(applied.changes.contains("updated priority"))
    }

    // --- gates and no-ops --------------------------------------------------------------------------

    @Test
    fun `shouldApply false is a pure no-op that records nothing`() {
        val (engine, taskId) = engineWithCapture()
        val before = engine.state
        val historyBefore = engine.listChangeHistory().size
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(shouldApply = false, folderName = "Diet App", scheduledTime = "17:00")
        )
        assertNull(applied)
        assertEquals(before, engine.state)
        assertEquals(historyBefore, engine.listChangeHistory().size)
    }

    @Test
    fun `confidence below the web's 0_4 floor is skipped`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(taskId, fakeRevision(confidence = 0.39, folderName = "Diet App"))
        assertNull(applied)
        assertNull(engine.state.tasks.first { it.id == taskId }.folderId)
    }

    @Test
    fun `an all-null revision changes nothing and records nothing`() {
        val (engine, taskId) = engineWithCapture()
        val historyBefore = engine.listChangeHistory().size
        assertNull(engine.applyEnrichment(taskId, fakeRevision()))
        assertEquals(historyBefore, engine.listChangeHistory().size)
    }

    @Test
    fun `the task is never renamed`() {
        val (engine, taskId) = engineWithCapture("Water plants")
        engine.applyEnrichment(taskId, fakeRevision(title = "Hydrate the flora", folderName = "House Work"))
        assertEquals("Water plants", engine.state.tasks.first { it.id == taskId }.title)
    }

    @Test
    fun `done-state and completion fields apply`() {
        val (engine, taskId) = engineWithCapture()
        val applied = engine.applyEnrichment(taskId, fakeRevision(definitionOfDone = "  All pots watered.  "))
        assertNotNull(applied)
        val task = engine.state.tasks.first { it.id == taskId }
        assertEquals("All pots watered.", task.definitionOfDone)
        assertEquals(CompletionMode.OutcomeDone, task.completionMode) // simple_done upgraded
        assertTrue(applied!!.changes.contains("updated done-state"))
    }

    // --- undo --------------------------------------------------------------------------------------

    @Test
    fun `undo restores the capture exactly as typed`() {
        val (engine, taskId) = engineWithCapture()
        val afterCapture = engine.state
        val applied = engine.applyEnrichment(
            taskId,
            fakeRevision(folderName = "Diet App", dateIntent = RevisionDateIntent.Today, scheduledTime = "17:00", effortMinutes = 45)
        )
        assertNotNull(applied)
        assertEquals("AI filed: Water plants", engine.listChangeHistory().first().summary)
        engine.undoChange()
        assertEquals(afterCapture, engine.state)
        val task = engine.state.tasks.first { it.id == taskId }
        assertNull(task.folderId)
        assertNull(task.scheduledTime)
        assertEquals(30, task.effortMinutes)
        assertNull(findDayList(engine.state, engine.state.currentDate)!!.entries.first { it.taskId == taskId }.pinnedTime)
    }

    @Test
    fun `archived tasks are not enriched`() {
        val (engine, taskId) = engineWithCapture()
        engine.archiveTask(taskId)
        assertNull(engine.applyEnrichment(taskId, fakeRevision(folderName = "Diet App")))
    }
}
