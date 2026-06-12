package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.ai.CaptureRevision
import com.twolaugh.ex3cuusion.core.ai.RevisionDateIntent
import com.twolaugh.ex3cuusion.core.store.normalizeState
import com.twolaugh.ex3cuusion.core.store.stateJson
import com.twolaugh.ex3cuusion.core.model.ActiveTimer
import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.CompletionEvent
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import com.twolaugh.ex3cuusion.core.model.DateIntent
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.DayList
import com.twolaugh.ex3cuusion.core.model.DayListEntry
import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.model.Document
import com.twolaugh.ex3cuusion.core.model.Energy
import com.twolaugh.ex3cuusion.core.model.ExecutionEvent
import com.twolaugh.ex3cuusion.core.model.ExecutionEventType
import com.twolaugh.ex3cuusion.core.model.IntentType
import com.twolaugh.ex3cuusion.core.model.PlannerFields
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.model.Strictness
import com.twolaugh.ex3cuusion.core.model.Task
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.model.TaskType
import com.twolaugh.ex3cuusion.core.model.TrayOutcome
import com.twolaugh.ex3cuusion.core.model.TraySignal
import com.twolaugh.ex3cuusion.core.store.MAIN_FOLDER_ID
import com.twolaugh.ex3cuusion.core.store.StateStore
import com.twolaugh.ex3cuusion.core.store.UndoStack
import com.twolaugh.ex3cuusion.core.store.ChangeHistoryItem
import com.twolaugh.ex3cuusion.core.store.mainFolder
import java.time.Instant
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// T103: the state mutations from src/lib/state.ts (day-list slice) plus the unbuilt T095/T096
// behaviours, as methods on a single engine that owns the live AppState. The TS mutates a live
// module-level object in place; the Kotlin model is immutable, so the engine holds `var state`
// and every mutation swaps in an updated copy — same call shape, same undo semantics (snapshot
// recorded BEFORE the mutation; immutability makes the snapshot free, no structuredClone needed).
class DomainEngine(
    initialState: AppState,
    private val undoStack: UndoStack,
    private val store: StateStore? = null
) {
    var state: AppState = initialState
        private set

    private var idCounter = 0

    // --- plumbing -------------------------------------------------------------------------------

    private fun nowIso(): String = stateTimestamp(state)

    private fun recordChange(source: String, summary: String) {
        undoStack.record(source, summary, nowIso(), state)
    }

    private fun persist() {
        store?.save(state)
    }

    private fun nextId(prefix: String): String {
        idCounter += 1
        return "${prefix}_${idCounter}_${UUID.randomUUID().toString().take(8)}"
    }

    fun listChangeHistory(): List<ChangeHistoryItem> = undoStack.list()

    // Restore the snapshot captured before the given change (or the most recent), undoing it and
    // any later changes (LIFO rewind).
    fun undoChange(id: String? = null): AppState {
        val restored = undoStack.undo(id) ?: return state
        state = restored
        persist()
        return state
    }

    private fun truncateTitle(title: String): String =
        if (title.length > 40) title.take(37) + "..." else title

    private fun findTask(taskId: String): Task? = state.tasks.find { it.id == taskId }

    private fun updateTaskIn(taskId: String, transform: (Task) -> Task) {
        state = state.copy(tasks = state.tasks.map { if (it.id == taskId) transform(it) else it })
    }

    // T110: the day-list mutations are date-addressed (default today) so planning tomorrow rides
    // the exact same code paths. Callers always ensureDayList(date) first, so the !! is safe.
    private fun dayListFor(date: String): DayList = findDayList(state, date)!!

    private fun replaceDayList(date: String, transform: (DayList) -> DayList) {
        state = state.copy(dayLists = state.dayLists.map { if (it.date == date) transform(it) else it })
    }

    // Human handle for change summaries: "today's list" / "tomorrow's list" / "the <date> list".
    private fun listLabel(date: String): String = when (date) {
        state.currentDate -> "today's list"
        addDays(state.currentDate, 1) -> "tomorrow's list"
        else -> "the $date list"
    }

    private fun normalizedEntries(entries: List<DayListEntry>): List<DayListEntry> =
        entries.mapIndexed { index, entry -> if (entry.order == index) entry else entry.copy(order = index) }

    private fun upsertTraySignal(taskId: String, transform: (TraySignal) -> TraySignal) {
        val existing = findTraySignal(state, taskId)
        val updated = transform(existing ?: blankTraySignal(taskId))
        state = if (existing == null) {
            state.copy(traySignals = state.traySignals + updated)
        } else {
            state.copy(traySignals = state.traySignals.map { if (it.taskId == taskId) updated else it })
        }
    }

    private fun addExecutionEvent(
        type: ExecutionEventType,
        taskIds: List<String>? = null,
        planItemId: String? = null,
        actualMinutes: Int? = null,
        date: String = state.currentDate
    ) {
        state = state.copy(
            executionEvents = state.executionEvents + ExecutionEvent(
                id = nextId("event"),
                date = date,
                createdAt = nowIso(),
                type = type,
                taskIds = taskIds,
                planItemId = planItemId,
                actualMinutes = actualMinutes
            )
        )
    }

    // --- clock (test/dev harness, mirrors state.ts setClock/advanceDay; not undoable) -------------

    fun setClock(date: String, time: String) {
        state = state.copy(currentDate = date, currentTime = time)
        persist()
    }

    fun advanceDay() {
        state = state.copy(currentDate = addDays(state.currentDate, 1), currentTime = "08:30")
        persist()
    }

    // --- day list reads ---------------------------------------------------------------------------

    // THE single read-path gate: builds + stores the date's list on first access (default today;
    // a FUTURE date pre-seeds the plan-ahead list, T110). Silent (no history). For today it also
    // runs the one-shot midnight reconcile when the stored list was planned ahead.
    fun ensureDayList(date: String = state.currentDate): DayList {
        val (list, next) = ensureDayList(state, date)
        state = next
        return list
    }

    // The read model for the Today surface. Tray surfacing telemetry lands in state (persist-on-
    // read, like the web repository) — but ONLY for today: rendering a future date's tray while
    // planning must not move the acceptance signals (T110).
    fun dayListView(date: String = state.currentDate): DayListView {
        val list = ensureDayList(date)
        val rendered = renderDayList(state, list, recordTelemetry = date == state.currentDate)
        state = rendered.state
        persist()
        return rendered.view
    }

    // T095 close-out card for a date (default today). Pure read.
    fun closeoutView(date: String = state.currentDate): CloseoutView = buildCloseout(state, date)

    // --- day list mutations -----------------------------------------------------------------------

    // Append a task to the date's list (default today). Idempotent: re-adding an existing entry
    // is a silent no-op.
    fun addTaskToDayList(taskId: String, source: DayListSource = DayListSource.Tray, date: String = state.currentDate) {
        ensureDayList(date)
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        if (dayListFor(date).entries.any { it.taskId == taskId }) return
        recordChange("day_list", "Added \"${truncateTitle(task.title)}\" to ${listLabel(date)}")
        val pinnedTime = if (task.scheduledDate == date && validTime(task.scheduledTime)) task.scheduledTime else null
        replaceDayList(date) { list ->
            list.copy(entries = normalizedEntries(list.entries + DayListEntry(taskId = taskId, order = list.entries.size, pinnedTime = pinnedTime, source = source)))
        }
        // T093 acceptance telemetry: a tray add is a positive outcome and clears the ignore streak.
        // T110: TODAY's adds only — accepting a suggestion for tomorrow while planning is not the
        // same act the signal models, and must not distort acceptance learning.
        if (source == DayListSource.Tray && date == state.currentDate) {
            upsertTraySignal(taskId) { it.copy(addedCount = it.addedCount + 1, ignoredStreak = 0, lastOutcome = TrayOutcome.Added) }
        }
        persist()
    }

    // Remove an entry from the date's list (back to the tray). The task itself is untouched.
    fun removeTaskFromDayList(taskId: String, date: String = state.currentDate) {
        ensureDayList(date)
        if (dayListFor(date).entries.none { it.taskId == taskId }) return
        val task = findTask(taskId)
        recordChange("day_list", "Removed \"${truncateTitle(task?.title ?: taskId)}\" from ${listLabel(date)}")
        replaceDayList(date) { list -> list.copy(entries = normalizedEntries(list.entries.filter { it.taskId != taskId })) }
        // T093: eject is information, not ignoring — record it and clear the ignore streak.
        // T110: today only, same reasoning as the add signal above.
        if (date == state.currentDate) {
            upsertTraySignal(taskId) { it.copy(lastOutcome = TrayOutcome.Ejected, ignoredStreak = 0) }
        }
        persist()
    }

    // T093 aging -> question resolution: "someday" demotes the task and restarts the spaced
    // 7/14/30/90 schedule from today; "keep" just clears the ignore streak so damping releases.
    fun resolveStaleTask(taskId: String, resolution: StaleResolution) {
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        recordChange(
            "day_list",
            if (resolution == StaleResolution.Someday) "Moved \"${truncateTitle(task.title)}\" to someday"
            else "Kept \"${truncateTitle(task.title)}\" in the rotation"
        )
        if (resolution == StaleResolution.Someday) {
            // applyTaskDateIntent(state, task, "someday") in state.ts: clear all dates, soften.
            updateTaskIn(taskId) {
                it.copy(
                    scheduledDate = null,
                    dueDate = null,
                    scheduledTime = null,
                    plannerFields = it.plannerFields.copy(pressureLevel = PressureLevel.Someday),
                    dateIntent = DateIntent(kind = DateIntentKind.Someday, confidence = 0.6)
                )
            }
            upsertTraySignal(taskId) {
                it.copy(surfacedCount = 0, ignoredStreak = 0, lastOutcome = null, lastSurfacedDate = state.currentDate)
            }
        } else {
            upsertTraySignal(taskId) { it.copy(ignoredStreak = 0) }
        }
        persist()
    }

    // Full replacement order for the date's list (default today). Unknown/duplicate ids are
    // ignored; entries missing from the request keep their previous relative order at the end.
    // A no-op records nothing.
    fun reorderDayList(orderedTaskIds: List<String>, date: String = state.currentDate) {
        ensureDayList(date)
        val list = dayListFor(date)
        val byTaskId = list.entries.associateBy { it.taskId }
        val requested = orderedTaskIds.distinct().filter { it in byTaskId }
        val requestedSet = requested.toHashSet()
        val current = list.entries.sortedBy { it.order }
        val next = requested.map { byTaskId.getValue(it) } + current.filter { it.taskId !in requestedSet }
        if (next.map { it.taskId } == current.map { it.taskId }) return
        recordChange("day_list", "Reordered ${listLabel(date)}")
        replaceDayList(date) { it.copy(entries = normalizedEntries(next)) }
        persist()
    }

    // Pin (or clear, with null) a display time on a list entry. Pins are sort/display only — the
    // capacity gauge owns the "does the day fit" question. Invalid times are rejected silently.
    fun setDayListPin(taskId: String, pinnedTime: String?, date: String = state.currentDate) {
        ensureDayList(date)
        val entry = dayListFor(date).entries.find { it.taskId == taskId } ?: return
        if (pinnedTime != null && !validTime(pinnedTime)) return
        if (entry.pinnedTime == pinnedTime) return
        val title = truncateTitle(findTask(taskId)?.title ?: taskId)
        recordChange("day_list", if (pinnedTime != null) "Pinned \"$title\" at $pinnedTime" else "Unpinned \"$title\"")
        replaceDayList(date) { list ->
            list.copy(entries = list.entries.map { if (it.taskId == taskId) it.copy(pinnedTime = pinnedTime) else it })
        }
        persist()
    }

    // --- completion --------------------------------------------------------------------------------

    // Tick a task straight off the list/habit strip, keyed by the CANONICAL plan id
    // (plan_<date>_<taskId>), toggling off a completion recorded today. Undoable.
    fun completeTaskDirect(taskId: String, actualMinutes: Int? = null) {
        val task = findTask(taskId) ?: return
        if (task.status == TaskStatus.Archived) return
        recordChange("complete", "Ticked \"${truncateTitle(task.title)}\"")
        val date = state.currentDate
        val planItemId = "plan_${date}_$taskId"

        val existing = state.completions.find { event ->
            event.date == date && (event.planItemId == planItemId || event.taskIds?.contains(taskId) == true)
        }
        if (existing != null) {
            state = state.copy(
                completions = state.completions.mapNotNull { event ->
                    if (event !== existing) return@mapNotNull event
                    val remainingTaskIds = (event.taskIds ?: emptyList()).filter { it != taskId }
                    if (remainingTaskIds.isEmpty()) null else event.copy(taskIds = remainingTaskIds)
                },
                executionEvents = state.executionEvents.filter { event ->
                    !(event.date == date && event.type == ExecutionEventType.Completed &&
                        (event.planItemId == planItemId || event.taskIds?.contains(taskId) == true))
                }
            )
            restoreTasksForUndoneCompletion(listOf(taskId))
            rollBackCompletionTimestamps(taskId)
            persist()
            return
        }

        state = state.copy(deferrals = state.deferrals.filter { !(it.date == date && it.planItemId == planItemId) })
        markTasksCompleted(listOf(taskId))
        state = state.copy(
            completions = state.completions + CompletionEvent(
                id = nextId("completion"),
                date = date,
                planItemId = planItemId,
                taskIds = listOf(taskId),
                actualMinutes = actualMinutes
            )
        )
        addExecutionEvent(ExecutionEventType.Completed, taskIds = listOf(taskId), planItemId = planItemId, actualMinutes = actualMinutes)
        persist()
    }

    // exhaust_once tasks complete; everything else snaps back to active (repeatable semantics).
    private fun markTasksCompleted(taskIds: List<String>) {
        val completedAt = nowIso()
        state = state.copy(
            tasks = state.tasks.map { task ->
                if (task.id !in taskIds) task
                else task.copy(
                    status = if (task.completionBehavior == CompletionBehavior.ExhaustOnce) TaskStatus.Completed else TaskStatus.Active,
                    completedAt = completedAt,
                    lastCompletedAt = completedAt
                )
            }
        )
    }

    private fun restoreTasksForUndoneCompletion(taskIds: List<String>) {
        val stillCompleted = state.completions
            .flatMap { event -> (event.taskIds ?: emptyList()).filter { it in taskIds } }
            .toHashSet()
        state = state.copy(
            tasks = state.tasks.map { task ->
                if (task.id in taskIds && task.id !in stillCompleted) {
                    task.copy(status = TaskStatus.Active, completedAt = null, lastCompletedAt = null)
                } else {
                    task
                }
            }
        )
    }

    // T092: after unticking TODAY's completion of a task that also completed on earlier days, roll
    // completedAt/lastCompletedAt back to the latest REMAINING completion day so today reads as
    // unticked while the history (and streaks) stand.
    private fun rollBackCompletionTimestamps(taskId: String) {
        val latestRemaining = state.completions
            .filter { it.taskIds?.contains(taskId) == true }
            .map { it.date }
            .maxOrNull()
        val rolledBack = latestRemaining?.let { "${it}T12:00:00.000Z" }
        val today = state.currentDate
        updateTaskIn(taskId) { task ->
            var next = task
            if (next.lastCompletedAt?.take(10) == today) next = next.copy(lastCompletedAt = rolledBack)
            if (next.completedAt?.take(10) == today) next = next.copy(completedAt = rolledBack)
            next
        }
    }

    // --- instant capture ---------------------------------------------------------------------------

    // Inline instant add: create a minimal task and put it on the date's list (default today) as
    // ONE undoable change. Capture during planning lands on TOMORROW's list (T110).
    // AI enrichment is a SEPARATE follow-up step (T105); nothing here calls a model.
    fun instantCaptureToDayList(title: String, date: String = state.currentDate): String? {
        val cleaned = title.trim()
        if (cleaned.isEmpty()) return null
        ensureDayList(date) // materialize the list BEFORE the snapshot so undo keeps it
        recordChange("capture", "Captured \"${truncateTitle(cleaned)}\" to ${listLabel(date)}")
        val task = Task(
            id = uniqueStateId(),
            title = cleaned,
            type = TaskType.Atomic,
            status = TaskStatus.Active,
            repeatPolicy = RepeatPolicy.None,
            completionBehavior = CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.SimpleDone,
            plannerFields = PlannerFields(intentType = IntentType.Obligation, pressureLevel = PressureLevel.Soft),
            priority = 5,
            importance = 3,
            urgency = 3,
            effortMinutes = 30,
            energy = Energy.Medium,
            strictness = Strictness.Normal,
            source = "manual"
        )
        state = state.copy(tasks = state.tasks + task)
        replaceDayList(date) { list ->
            list.copy(entries = normalizedEntries(list.entries + DayListEntry(taskId = task.id, order = list.entries.size, source = DayListSource.Manual)))
        }
        persist()
        return task.id
    }

    // state.ts uniqueStateId: task_0001-style, scanning existing ids for the next free number.
    private fun uniqueStateId(): String {
        val ids = state.tasks.mapTo(HashSet()) { it.id }
        val numbered = Regex("""^task_(\d+)$""")
        var index = ids.mapNotNull { numbered.find(it)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
        var next: String
        do {
            index += 1
            next = "task_" + index.toString().padStart(4, '0')
        } while (next in ids)
        return next
    }

    // Reorder habit chips (user drag). Habit display order = their relative order in state.tasks;
    // reposition the habit tasks into the array slots habit tasks already occupy, everything else
    // untouched. Undoable.
    fun reorderHabitTasks(orderedTaskIds: List<String>) {
        val habitIds = state.tasks.filter { it.habit == true }.map { it.id }
        val sanitized = orderedTaskIds.filter { it in habitIds.toSet() } + habitIds.filter { it !in orderedTaskIds.toSet() }
        if (sanitized == habitIds) return
        recordChange("manual_edit", "Reordered habits")
        val byId = state.tasks.associateBy { it.id }
        var next = 0
        state = state.copy(tasks = state.tasks.map { task ->
            if (task.habit == true) byId.getValue(sanitized[next++]) else task
        })
        persist()
    }

    // state.ts uniqueFolderId: folder_0001-style, scanning existing ids for the next free number.
    private fun uniqueFolderId(): String {
        val ids = state.folders.mapTo(HashSet()) { it.id }
        val numbered = Regex("""^folder_(\d+)$""")
        var index = ids.mapNotNull { numbered.find(it)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
        var next: String
        do {
            index += 1
            next = "folder_" + index.toString().padStart(4, '0')
        } while (next in ids)
        return next
    }

    // --- T106: folder structure mutations (applyStructureMutation's folder branch, state.ts) -------

    // T088: true if folder `nodeId` is within the subtree rooted at `ancestorId` (walks up the
    // parentFolderId chain), used to reject folder-parenting choices that would create a cycle.
    private fun isFolderDescendantOf(nodeId: String, ancestorId: String): Boolean {
        var current = state.folders.find { it.id == nodeId }
        val seen = mutableSetOf<String>()
        while (current?.parentFolderId != null && current.id !in seen) {
            seen.add(current.id)
            if (current.parentFolderId == ancestorId) return true
            current = state.folders.find { it.id == current!!.parentFolderId }
        }
        return false
    }

    // resolveFolderParent (state.ts): the parent id, or null to clear/reject. Rejects self-
    // parenting and any choice that would create a cycle (parenting a folder under one of its
    // own descendants).
    private fun resolveFolderParent(requested: String?, selfId: String? = null): String? {
        if (requested.isNullOrEmpty()) return null
        if (requested == selfId) return null
        val parent = state.folders.find { it.id == requested } ?: return null
        if (selfId != null && isFolderDescendantOf(requested, selfId)) return null
        return parent.id
    }

    fun createFolder(patch: FolderPatch): String {
        val cleanedName = patch.name?.trim()?.takeIf { it.isNotEmpty() }
        recordChange("manual_edit", "Created folder${cleanedName?.let { " \"${truncateTitle(it)}\"" } ?: ""}")
        val folder = Folder(
            id = uniqueFolderId(),
            name = cleanedName ?: "New folder",
            parentFolderId = resolveFolderParent(patch.parentFolderId),
            weight = patch.weight?.let { min(10, max(1, it)) },
            canBlock = patch.canBlock,
            defaultBlockMinutes = patch.defaultBlockMinutes?.let { min(480, max(5, it)) },
            contextNote = patch.contextNote?.trim()?.takeIf { it.isNotEmpty() },
            status = patch.status ?: FolderStatus.Active
        )
        state = state.copy(folders = state.folders + folder)
        persist()
        return folder.id
    }

    fun updateFolder(folderId: String, patch: FolderPatch) {
        val folder = state.folders.find { it.id == folderId } ?: return
        recordChange("manual_edit", "Updated folder \"${truncateTitle(folder.name)}\"")
        state = state.copy(
            folders = state.folders.map { current ->
                if (current.id != folderId) current
                else {
                    var next = current
                    patch.name?.trim()?.takeIf { it.isNotEmpty() }?.let { next = next.copy(name = it) }
                    // "" clears (folder becomes top level); a cycle-creating choice also clears,
                    // exactly like the web's resolveFolderParent.
                    if (patch.parentFolderId != null) {
                        next = next.copy(parentFolderId = resolveFolderParent(patch.parentFolderId, current.id))
                    }
                    patch.weight?.let { next = next.copy(weight = clamp(it, 1, 10, current.weight ?: 5)) }
                    patch.canBlock?.let { next = next.copy(canBlock = it) }
                    patch.defaultBlockMinutes?.let {
                        next = next.copy(defaultBlockMinutes = clamp(it, 5, 480, current.defaultBlockMinutes ?: 30))
                    }
                    // optionalText semantics: "" clears, non-empty sets.
                    patch.contextNote?.let { next = next.copy(contextNote = it.trim().takeIf { t -> t.isNotEmpty() }) }
                    patch.status?.let { next = next.copy(status = it) }
                    next
                }
            }
        )
        persist()
    }

    fun archiveFolder(folderId: String) {
        val folder = state.folders.find { it.id == folderId } ?: return
        recordChange("manual_edit", "Archived folder \"${truncateTitle(folder.name)}\"")
        state = state.copy(
            folders = state.folders.map { if (it.id == folderId) it.copy(status = FolderStatus.Archived) else it }
        )
        persist()
    }

    // --- T108: folder documents (Keep-style pages) ----------------------------------------------------

    // doc_0001-style ids, scanning existing ids for the next free number (uniqueStateId pattern).
    private fun uniqueDocumentId(): String {
        val ids = state.documents.mapTo(HashSet()) { it.id }
        val numbered = Regex("""^doc_(\d+)$""")
        var index = ids.mapNotNull { numbered.find(it)?.groupValues?.get(1)?.toIntOrNull() }.maxOrNull() ?: 0
        var next: String
        do {
            index += 1
            next = "doc_" + index.toString().padStart(4, '0')
        } while (next in ids)
        return next
    }

    private fun findDocument(documentId: String): Document? = state.documents.find { it.id == documentId }

    // A note's display handle for change summaries: the title, else the first line of the body.
    private fun documentLabel(title: String?, body: String): String =
        truncateTitle(title?.trim()?.takeIf { it.isNotEmpty() } ?: body.lineSequence().firstOrNull()?.trim().orEmpty())

    // Create a note in `folderId` (an unknown folder falls back to Main, which is materialized
    // into the state if a never-normalized state lacks it — a note must never dangle). Undoable.
    fun createDocument(folderId: String, body: String, title: String? = null): String {
        recordChange("manual_edit", "Created note \"${documentLabel(title, body)}\"")
        val target = if (state.folders.any { it.id == folderId }) {
            folderId
        } else {
            if (state.folders.none { it.id == MAIN_FOLDER_ID }) {
                state = state.copy(folders = state.folders + mainFolder())
            }
            MAIN_FOLDER_ID
        }
        val now = nowIso()
        val document = Document(
            id = uniqueDocumentId(),
            folderId = target,
            title = title?.trim()?.takeIf { it.isNotEmpty() },
            body = body,
            createdAt = now,
            updatedAt = now
        )
        state = state.copy(documents = state.documents + document)
        persist()
        return document.id
    }

    // Edit a note. optionalText semantics on title ("" clears, null = not provided); body null =
    // not provided. updatedAt bumps only when something actually changed — an unchanged save is
    // a pure no-op (no history, no recency bump).
    fun updateDocument(documentId: String, title: String? = null, body: String? = null) {
        val document = findDocument(documentId) ?: return
        var next = document
        if (title != null) next = next.copy(title = title.trim().takeIf { it.isNotEmpty() })
        if (body != null) next = next.copy(body = body)
        if (next == document) return
        recordChange("manual_edit", "Updated note \"${documentLabel(next.title, next.body)}\"")
        val stamped = next.copy(updatedAt = nowIso())
        state = state.copy(documents = state.documents.map { if (it.id == documentId) stamped else it })
        persist()
    }

    fun deleteDocument(documentId: String) {
        val document = findDocument(documentId) ?: return
        recordChange("manual_edit", "Deleted note \"${documentLabel(document.title, document.body)}\"")
        state = state.copy(documents = state.documents.filter { it.id != documentId })
        persist()
    }

    // Refile a note into another folder. Unknown target or already-there = silent no-op. The
    // move bumps updatedAt so the receiving page rises in the grid's recency order.
    fun moveDocument(documentId: String, folderId: String) {
        val document = findDocument(documentId) ?: return
        if (document.folderId == folderId) return
        val folder = state.folders.find { it.id == folderId } ?: return
        recordChange(
            "manual_edit",
            "Moved note \"${documentLabel(document.title, document.body)}\" to \"${truncateTitle(folder.name)}\""
        )
        val moved = document.copy(folderId = folderId, updatedAt = nowIso())
        state = state.copy(documents = state.documents.map { if (it.id == documentId) moved else it })
        persist()
    }

    // Set a folder's palette index (clamped to the 8-tone palette). Same-colour tap = no-op.
    fun setFolderColor(folderId: String, index: Int) {
        val folder = state.folders.find { it.id == folderId } ?: return
        val clamped = min(7, max(0, index))
        if (folder.color == clamped) return
        recordChange("manual_edit", "Recoloured \"${truncateTitle(folder.name)}\"")
        state = state.copy(
            folders = state.folders.map { if (it.id == folderId) it.copy(color = clamped) else it }
        )
        persist()
    }

    // --- T107: data bridge import --------------------------------------------------------------------

    // Parse + normalize a shared state.json and REPLACE the live state with it, as ONE undoable
    // change ("Imported data" — the snapshot is recorded before the swap, so undo restores the
    // pre-import state exactly). The phone's clock wins: the imported document's currentDate/
    // currentTime (the web workbench's clock) are discarded so today's list stays today's.
    // Garbage/wrong-shape JSON fails BEFORE anything is recorded — a rejected import is a no-op.
    fun importState(json: String): Result<ImportSummary> {
        val parsed = try {
            normalizeState(stateJson.decodeFromString(AppState.serializer(), json))
        } catch (e: Exception) {
            return Result.failure(e)
        }
        recordChange("import", "Imported data")
        state = parsed.copy(currentDate = state.currentDate, currentTime = state.currentTime)
        persist()
        return Result.success(ImportSummary(taskCount = parsed.tasks.size, folderCount = parsed.folders.size))
    }

    // --- T105: AI enrichment apply path --------------------------------------------------------------

    // Translation of the web's enrichCapturedTask -> applyRevisionToTask (src/lib/state.ts):
    // apply a model-authored CaptureRevision to one captured task as ONE undoable change.
    // Deviations from the web, per the T105 ticket: the change records ONLY when something
    // actually changed (the web records "Enriched ..." unconditionally), and a gated revision
    // (shouldApply=false / low confidence) is a pure no-op (the web stashes the note in
    // task.notes). The task is NEVER renamed — the web passes an empty message, so its rename
    // guard (shouldApplyRevisionTitle) can never pass; revision.title is ignored entirely.
    fun applyEnrichment(taskId: String, revision: CaptureRevision): EnrichmentApplied? {
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return null
        // The web's gate in applyRevisionToTask: `!revision.shouldApply || revision.confidence < 0.4`.
        if (!revision.shouldApply || revision.confidence < ENRICHMENT_CONFIDENCE_FLOOR) return null
        ensureDayList() // materialize before the snapshot so undo keeps it (instantCapture pattern)

        val changes = mutableListOf<String>()
        var next = task

        val folder = revision.folderName?.let { findFolderMention(state, it) }
        if (folder != null) {
            val inChildFolder = folder.parentFolderId != null
            next = next.copy(
                folderId = folder.id,
                type = when {
                    inChildFolder -> TaskType.ProjectTask
                    next.completionBehavior == CompletionBehavior.KeepAsSuggestion -> TaskType.SoftInvitation
                    else -> TaskType.Atomic
                },
                plannerFields = if (inChildFolder) next.plannerFields.copy(intentType = IntentType.Progress) else next.plannerFields
            )
            changes += "moved under ${folder.name}"
        }

        applyRevisionDate(next, revision)?.let { (dated, label) -> next = dated; changes += label }
        applyRevisionTime(next, revision)?.let { (timed, label) -> next = timed; changes += label }

        // Web: `if (revision.effortMinutes && revision.effortMinutes !== task.effortMinutes)`.
        // The schema promises 5..480; clamp anyway since nothing else validates it on this side.
        val effort = revision.effortMinutes?.takeIf { it > 0 }?.let { min(480, max(5, it)) }
        if (effort != null && effort != next.effortMinutes) {
            next = next.copy(
                effortMinutes = effort,
                estimateConfidence = max(next.estimateConfidence ?: 0.5, revision.confidence)
            )
            changes += "set estimate to ${effort}m"
        }

        // Scores apply when present (web truthiness; schema range 1..9, clamped here too).
        revision.priority?.let { next = next.copy(priority = clamp(it, 1, 9, next.priority)) }
        revision.importance?.let { next = next.copy(importance = clamp(it, 1, 9, next.importance)) }
        revision.urgency?.let { next = next.copy(urgency = clamp(it, 1, 9, next.urgency)) }
        if (revision.priority != null || revision.importance != null || revision.urgency != null) changes += "updated priority"

        revision.definitionOfDone?.trim()?.takeIf { it.isNotEmpty() }?.let { dod ->
            next = next.copy(
                definitionOfDone = dod,
                completionMode = if (next.completionMode == CompletionMode.SimpleDone) CompletionMode.OutcomeDone else next.completionMode
            )
            changes += "updated done-state"
        }

        if (revision.completionBehavior != null || revision.completionMode != null) {
            next = next.copy(
                completionBehavior = revision.completionBehavior ?: next.completionBehavior,
                completionMode = revision.completionMode ?: next.completionMode
            )
            changes += "updated completion behavior"
        }

        revision.note?.trim()?.takeIf { it.isNotEmpty() }?.let { note ->
            next = next.copy(notes = listOfNotNull(next.notes, "Follow-up: $note").joinToString("\n"))
            changes += "added note"
        }

        // Keep the list pin in sync when enrichment scheduled the task for today at a clock time
        // (enrichCapturedTask in state.ts).
        val entry = dayListFor(state.currentDate).entries.find { it.taskId == taskId }
        val pinTime = next.scheduledTime?.takeIf { next.scheduledDate == state.currentDate && validTime(it) }
        val pinChanged = entry != null && pinTime != null && entry.pinnedTime != pinTime

        if (next == task && !pinChanged) return null // a no-op records nothing

        recordChange("enrich", "AI filed: ${truncateTitle(task.title)}")
        updateTaskIn(taskId) { next }
        if (pinChanged) {
            replaceDayList(state.currentDate) { list ->
                list.copy(entries = list.entries.map { if (it.taskId == taskId) it.copy(pinnedTime = pinTime) else it })
            }
        }
        persist()
        return EnrichmentApplied(folderName = folder?.name, changes = changes.distinct())
    }

    // applyRevisionDate (state.ts): one date altitude per revision, each clearing the others.
    private fun applyRevisionDate(task: Task, revision: CaptureRevision): Pair<Task, String>? = when (revision.dateIntent) {
        null, RevisionDateIntent.Unchanged -> null
        RevisionDateIntent.NextWeek -> {
            val range = nextWeekRange(state.currentDate)
            task.copy(
                scheduledDate = null, scheduledTime = null, dueDate = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.WeekWindow, originalText = revision.summary,
                    startDate = range.startDate, endDate = range.endDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Soft)
            ) to "moved to next week"
        }
        RevisionDateIntent.ThisWeek -> {
            val range = weekRange(state.currentDate)
            task.copy(
                scheduledDate = null, scheduledTime = null, dueDate = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.WeekWindow, originalText = revision.summary,
                    startDate = range.startDate, endDate = range.endDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Soft)
            ) to "kept in this week"
        }
        RevisionDateIntent.Tomorrow -> {
            val scheduledDate = revision.scheduledDate?.takeIf { validDate(it) } ?: addDays(state.currentDate, 1)
            task.copy(
                scheduledDate = scheduledDate, dueDate = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.Tomorrow, originalText = revision.summary,
                    scheduledDate = scheduledDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Scheduled)
            ) to "scheduled for tomorrow"
        }
        RevisionDateIntent.Today -> {
            val scheduledDate = revision.scheduledDate?.takeIf { validDate(it) } ?: state.currentDate
            task.copy(
                scheduledDate = scheduledDate, dueDate = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.Today, originalText = revision.summary,
                    scheduledDate = scheduledDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Scheduled)
            ) to "scheduled for today"
        }
        RevisionDateIntent.Someday -> task.copy(
            scheduledDate = null, scheduledTime = null, dueDate = null,
            dateIntent = DateIntent(kind = DateIntentKind.Someday, originalText = revision.summary, confidence = revision.confidence),
            plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Someday)
        ) to "moved to someday"
        RevisionDateIntent.SpecificDate -> {
            if (!validDate(revision.scheduledDate)) null
            else task.copy(
                scheduledDate = revision.scheduledDate, dueDate = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.SpecificDate, originalText = revision.summary,
                    scheduledDate = revision.scheduledDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Scheduled)
            ) to "scheduled for ${revision.scheduledDate}"
        }
        RevisionDateIntent.Deadline -> {
            if (!validDate(revision.dueDate)) null
            else task.copy(
                dueDate = revision.dueDate, scheduledDate = null, scheduledTime = null,
                dateIntent = DateIntent(
                    kind = DateIntentKind.Deadline, originalText = revision.summary,
                    dueDate = revision.dueDate, confidence = revision.confidence
                ),
                plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Due)
            ) to "deadline set to ${revision.dueDate}"
        }
    }

    // applyRevisionTime (state.ts): a valid HH:mm pins the task to a clock time, defaulting the
    // date to today, and clears any deadline.
    private fun applyRevisionTime(task: Task, revision: CaptureRevision): Pair<Task, String>? {
        val time = revision.scheduledTime?.takeIf { validTime(it) } ?: return null
        val scheduledDate = task.scheduledDate ?: revision.scheduledDate?.takeIf { validDate(it) } ?: state.currentDate
        val kind = when (scheduledDate) {
            state.currentDate -> DateIntentKind.Today
            addDays(state.currentDate, 1) -> DateIntentKind.Tomorrow
            else -> DateIntentKind.SpecificDate
        }
        return task.copy(
            scheduledDate = scheduledDate, scheduledTime = time, dueDate = null,
            dateIntent = DateIntent(kind = kind, originalText = revision.summary, scheduledDate = scheduledDate, confidence = revision.confidence),
            plannerFields = task.plannerFields.copy(pressureLevel = PressureLevel.Scheduled)
        ) to "scheduled for $time"
    }

    // --- T095: conscious release --------------------------------------------------------------------

    // "Let go" — guilt-free, distinct from archive: the task archives with released=true and its
    // entry leaves today's list, as one undoable change.
    fun releaseTask(taskId: String) {
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        ensureDayList() // materialize before the snapshot so undo keeps it (instantCapture pattern)
        recordChange("day_list", "Let go: \"${truncateTitle(task.title)}\"")
        updateTaskIn(taskId) { it.copy(status = TaskStatus.Archived, released = true) }
        // Archiving hides the task from EVERY date's render; only today's entry needs removing.
        replaceDayList(state.currentDate) { list -> list.copy(entries = normalizedEntries(list.entries.filter { it.taskId != taskId })) }
        persist()
    }

    // --- T096: task timer ----------------------------------------------------------------------------

    // Start (or restart on another task — one running timer at a time). Not undoable: only STOP
    // records history.
    fun startTaskTimer(taskId: String) {
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        state = state.copy(activeTimer = ActiveTimer(taskId = task.id, startedAt = nowIso(), accumulatedMinutes = 0))
        persist()
    }

    fun pauseTaskTimer() {
        val timer = state.activeTimer ?: return
        val started = timer.startedAt ?: return
        state = state.copy(
            activeTimer = timer.copy(startedAt = null, accumulatedMinutes = timer.accumulatedMinutes + elapsedMinutes(started, nowIso()))
        )
        persist()
    }

    fun resumeTaskTimer() {
        val timer = state.activeTimer ?: return
        if (timer.startedAt != null) return
        state = state.copy(activeTimer = timer.copy(startedAt = nowIso()))
        persist()
    }

    // Stop: actualMinutes = accumulated + the running segment's wall-clock elapsed. complete=true
    // routes through completeTaskDirect so the actual lands in the CompletionEvent (feeding
    // effectiveEffortMinutes and the T093 calibration); otherwise a worked_on execution event is
    // recorded. Either way this is ONE undoable change (the snapshot still holds the timer).
    fun stopTaskTimer(complete: Boolean): Int? {
        val timer = state.activeTimer ?: return null
        val actual = timer.accumulatedMinutes + (timer.startedAt?.let { elapsedMinutes(it, nowIso()) } ?: 0)
        if (complete) {
            completeTaskDirect(timer.taskId, actualMinutes = actual)
            state = state.copy(activeTimer = null)
        } else {
            val title = findTask(timer.taskId)?.title ?: timer.taskId
            recordChange("timer", "Worked on \"${truncateTitle(title)}\" (${actual}m)")
            state = state.copy(activeTimer = null)
            addWorkedOnEvent(timer.taskId, actual)
        }
        persist()
        return actual
    }

    // The ONE worked_on writer — timer stops and manual progress logs produce the identical event
    // shape, so calibration/forecasting and the progressMinutesToday views see both the same way.
    private fun addWorkedOnEvent(taskId: String, minutes: Int, date: String = state.currentDate) {
        addExecutionEvent(
            ExecutionEventType.WorkedOn,
            taskIds = listOf(taskId),
            planItemId = "plan_${date}_$taskId",
            actualMinutes = minutes,
            date = date
        )
    }

    // TaskSheet progress logging: hand-log minutes worked on a task without completing it — the
    // manual sibling of stopTaskTimer(complete = false). Undoable; non-positive minutes are a no-op.
    fun logTaskProgress(taskId: String, minutes: Int, date: String = state.currentDate) {
        if (minutes <= 0) return
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        recordChange("timer", "Logged ${minutes}m on \"${truncateTitle(task.title)}\"")
        addWorkedOnEvent(taskId, minutes, date)
        persist()
    }

    private fun elapsedMinutes(fromIso: String, toIso: String): Int {
        val millis = Instant.parse(toIso).toEpochMilli() - Instant.parse(fromIso).toEpochMilli()
        return max(0, (millis / 60000.0).roundToInt())
    }

    // --- task structure basics (applyStructureMutation's task branch, trimmed to v1 fields) ----------

    fun createTask(patch: TaskPatch): String {
        recordChange("manual_edit", "Created task${patch.title?.trim()?.takeIf { it.isNotEmpty() }?.let { " \"${truncateTitle(it)}\"" } ?: ""}")
        val folderId = patch.folderId?.takeIf { id -> state.folders.any { it.id == id } }
        val folder = folderId?.let { id -> state.folders.find { it.id == id } }
        val keepAsSuggestion = patch.completionBehavior == CompletionBehavior.KeepAsSuggestion
        val type = if (folder?.parentFolderId != null) {
            if (keepAsSuggestion) TaskType.SoftInvitation else TaskType.ProjectTask
        } else {
            TaskType.Atomic
        }
        val dueDate = patch.dueDate?.takeIf { validDate(it) }
        val task = Task(
            id = uniqueStateId(),
            title = patch.title?.trim()?.takeIf { it.isNotEmpty() } ?: "New task",
            type = type,
            folderId = folderId,
            status = TaskStatus.Active,
            repeatPolicy = patch.repeatPolicy ?: RepeatPolicy.None,
            completionBehavior = patch.completionBehavior ?: CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.SimpleDone,
            definitionOfDone = patch.definitionOfDone?.trim()?.takeIf { it.isNotEmpty() },
            plannerFields = PlannerFields(
                intentType = IntentType.Obligation,
                pressureLevel = if (dueDate != null) PressureLevel.Due else PressureLevel.Soft
            ),
            priority = clamp(patch.priority, 1, 10, 3),
            importance = clamp(patch.importance, 1, 10, 3),
            urgency = clamp(patch.urgency, 1, 10, 3),
            dueDate = dueDate,
            scheduledDate = patch.scheduledDate?.takeIf { validDate(it) },
            scheduledTime = patch.scheduledTime?.takeIf { validTime(it) },
            effortMinutes = clamp(patch.effortMinutes, 1, 720, 30),
            energy = patch.energy ?: Energy.Medium,
            strictness = patch.strictness ?: Strictness.Normal,
            source = "manual",
            habit = if (patch.habit == true) true else null
        )
        state = state.copy(tasks = state.tasks + task)
        persist()
        return task.id
    }

    // Patch a task. A patch that changes nothing records nothing (no history — the TaskSheet's
    // "no-op save" guarantee). `syncPinDate` is the sheet's pin-sync seam: when the patch carries
    // scheduledTime, the day-list entry pin for that date follows it ("" clears both) inside the
    // SAME undoable change, mirroring the applyEnrichment pin-sync pattern.
    fun updateTask(taskId: String, patch: TaskPatch, syncPinDate: String? = null) {
        val task = findTask(taskId) ?: return
        var next = task
        patch.title?.trim()?.takeIf { it.isNotEmpty() }?.let { next = next.copy(title = it) }
        if (patch.folderId != null) {
            val target = patch.folderId.takeIf { id -> state.folders.any { it.id == id } } ?: next.folderId
            val folder = target?.let { id -> state.folders.find { it.id == id } }
            val inChildFolder = folder?.parentFolderId != null
            next = next.copy(
                folderId = target,
                type = if (inChildFolder) {
                    if (next.completionBehavior == CompletionBehavior.KeepAsSuggestion) TaskType.SoftInvitation else TaskType.ProjectTask
                } else if (next.type == TaskType.ProjectTask) TaskType.Atomic else next.type
            )
        }
        patch.completionBehavior?.let { next = next.copy(completionBehavior = it) }
        patch.definitionOfDone?.trim()?.takeIf { it.isNotEmpty() }?.let { next = next.copy(definitionOfDone = it) }
        patch.priority?.let { next = next.copy(priority = clamp(it, 1, 10, next.priority)) }
        patch.importance?.let { next = next.copy(importance = clamp(it, 1, 10, next.importance)) }
        patch.urgency?.let { next = next.copy(urgency = clamp(it, 1, 10, next.urgency)) }
        patch.effortMinutes?.let { next = next.copy(effortMinutes = clamp(it, 1, 720, next.effortMinutes)) }
        // optionalText-style semantics on dueDate/scheduledTime: "" clears, a valid value sets,
        // junk is ignored (the sheet validates, but the engine must not trust it).
        patch.dueDate?.let {
            if (it.isEmpty()) next = next.copy(dueDate = null)
            else if (validDate(it)) next = next.copy(dueDate = it)
        }
        patch.scheduledDate?.takeIf { validDate(it) }?.let { next = next.copy(scheduledDate = it) }
        patch.scheduledTime?.let {
            if (it.isEmpty()) next = next.copy(scheduledTime = null)
            else if (validTime(it)) next = next.copy(scheduledTime = it)
        }
        patch.energy?.let { next = next.copy(energy = it) }
        patch.strictness?.let { next = next.copy(strictness = it) }
        // T092: explicit per-task habit flag (boolean only; false clears it).
        patch.habit?.let { next = next.copy(habit = if (it) true else null) }
        patch.repeatPolicy?.let { next = next.copy(repeatPolicy = it) }
        // Tags: full replacement, trimmed and blank-filtered; an all-blank list clears.
        patch.tags?.let { tags ->
            next = next.copy(tags = tags.map(String::trim).filter(String::isNotEmpty).takeIf(List<String>::isNotEmpty))
        }

        // Pin sync: the date's list entry follows the patched scheduledTime (valid sets, "" clears).
        var pinnedTime: String? = null
        var pinChanged = false
        if (syncPinDate != null && patch.scheduledTime != null && (patch.scheduledTime.isEmpty() || validTime(patch.scheduledTime))) {
            ensureDayList(syncPinDate) // materialize BEFORE the snapshot so undo keeps it
            val entry = dayListFor(syncPinDate).entries.find { it.taskId == taskId }
            pinnedTime = patch.scheduledTime.takeIf { it.isNotEmpty() }
            pinChanged = entry != null && entry.pinnedTime != pinnedTime
        }

        if (next == task && !pinChanged) return // a no-op save records nothing
        recordChange("manual_edit", "Updated task \"${truncateTitle(task.title)}\"")
        if (next != task) updateTaskIn(taskId) { next }
        if (pinChanged) {
            replaceDayList(syncPinDate!!) { list ->
                list.copy(entries = list.entries.map { if (it.taskId == taskId) it.copy(pinnedTime = pinnedTime) else it })
            }
        }
        persist()
    }

    fun archiveTask(taskId: String) {
        val task = findTask(taskId) ?: return
        recordChange("manual_edit", "Archived task \"${truncateTitle(task.title)}\"")
        updateTaskIn(taskId) { it.copy(status = TaskStatus.Archived) }
        persist()
    }

    private fun clamp(value: Int?, minValue: Int, maxValue: Int, fallback: Int): Int =
        if (value == null) fallback else min(maxValue, max(minValue, value))
}

enum class StaleResolution { Someday, Keep }

// T105: what applyEnrichment changed — null result means nothing was applied. folderName feeds
// the "AI filed: <folder> · <changes>" snackbar.
data class EnrichmentApplied(val folderName: String?, val changes: List<String>)

// The web's apply threshold in applyRevisionToTask (state.ts): confidence below this skips the
// whole revision. NOTE: the web uses 0.4, not the 0.3 the T105 ticket sketch mentioned.
const val ENRICHMENT_CONFIDENCE_FLOOR = 0.4

// Port of findFolderMention (state.ts): resolve a folderName to an active folder by exact full
// path (when the name contains "/"), then exact name; with duplicated names, prefer the child
// folder (the more specific placement). Deliberately NO substring matching: "Housework" must
// never resolve to "Work".
internal fun findFolderMention(state: AppState, name: String): Folder? {
    val folders = state.folders.filter { it.status != FolderStatus.Archived }
    val lower = name.trim().lowercase()
    if (lower.isEmpty()) return null
    if ("/" in lower) {
        folders.find { (folderPath(state, it.id) ?: "").lowercase() == lower }?.let { return it }
    }
    val exactNameMatches = folders.filter { it.name.lowercase() == lower }
    if (exactNameMatches.size == 1) return exactNameMatches[0]
    return exactNameMatches.find { it.parentFolderId != null }
}

// The v1 create/update surface (state.ts applyStructureMutation task branch trimmed to the
// fields the daily loop needs). Null means "not provided".
data class TaskPatch(
    val title: String? = null,
    val folderId: String? = null,
    val effortMinutes: Int? = null,
    val priority: Int? = null,
    val importance: Int? = null,
    val urgency: Int? = null,
    val habit: Boolean? = null,
    // Full tag replacement (trimmed/blank-filtered in updateTask); null = not provided.
    val tags: List<String>? = null,
    val repeatPolicy: RepeatPolicy? = null,
    val dueDate: String? = null,
    val scheduledDate: String? = null,
    val scheduledTime: String? = null,
    val completionBehavior: CompletionBehavior? = null,
    val definitionOfDone: String? = null,
    val strictness: Strictness? = null,
    val energy: Energy? = null
)

// T106: patch shape for folder create/update (mirrors the web folder structure-mutation patch).
data class FolderPatch(
    val name: String? = null,
    val parentFolderId: String? = null,
    val weight: Int? = null,
    val canBlock: Boolean? = null,
    val defaultBlockMinutes: Int? = null,
    val contextNote: String? = null,
    val status: FolderStatus? = null
)

// T107: what an import would apply, surfaced for the confirm dialog.
data class ImportSummary(val taskCount: Int, val folderCount: Int)
