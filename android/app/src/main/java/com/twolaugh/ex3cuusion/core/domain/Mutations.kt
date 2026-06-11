package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.ActiveTimer
import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.CompletionEvent
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import com.twolaugh.ex3cuusion.core.model.DateIntent
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.DayList
import com.twolaugh.ex3cuusion.core.model.DayListEntry
import com.twolaugh.ex3cuusion.core.model.DayListSource
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
import com.twolaugh.ex3cuusion.core.store.StateStore
import com.twolaugh.ex3cuusion.core.store.UndoStack
import com.twolaugh.ex3cuusion.core.store.ChangeHistoryItem
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

    private fun todayList(): DayList = findDayList(state, state.currentDate)!!

    private fun replaceTodayList(transform: (DayList) -> DayList) {
        val date = state.currentDate
        state = state.copy(dayLists = state.dayLists.map { if (it.date == date) transform(it) else it })
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
        actualMinutes: Int? = null
    ) {
        state = state.copy(
            executionEvents = state.executionEvents + ExecutionEvent(
                id = nextId("event"),
                date = state.currentDate,
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

    // THE single read-path gate: builds + stores today's list on first access. Silent (no history).
    fun ensureDayList(): DayList {
        val (list, next) = ensureDayList(state, state.currentDate)
        state = next
        return list
    }

    // The read model for the Today surface. Tray surfacing telemetry lands in state (persist-on-
    // read, like the web repository).
    fun dayListView(): DayListView {
        val list = ensureDayList()
        val rendered = renderDayList(state, list)
        state = rendered.state
        persist()
        return rendered.view
    }

    // T095 close-out card for a date (default today). Pure read.
    fun closeoutView(date: String = state.currentDate): CloseoutView = buildCloseout(state, date)

    // --- day list mutations -----------------------------------------------------------------------

    // Append a task to today's list. Idempotent: re-adding an existing entry is a silent no-op.
    fun addTaskToDayList(taskId: String, source: DayListSource = DayListSource.Tray) {
        ensureDayList()
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        if (todayList().entries.any { it.taskId == taskId }) return
        recordChange("day_list", "Added \"${truncateTitle(task.title)}\" to today's list")
        val pinnedTime = if (task.scheduledDate == state.currentDate && validTime(task.scheduledTime)) task.scheduledTime else null
        replaceTodayList { list ->
            list.copy(entries = normalizedEntries(list.entries + DayListEntry(taskId = taskId, order = list.entries.size, pinnedTime = pinnedTime, source = source)))
        }
        // T093 acceptance telemetry: a tray add is a positive outcome and clears the ignore streak.
        if (source == DayListSource.Tray) {
            upsertTraySignal(taskId) { it.copy(addedCount = it.addedCount + 1, ignoredStreak = 0, lastOutcome = TrayOutcome.Added) }
        }
        persist()
    }

    // Remove an entry from today's list (back to the tray). The task itself is untouched.
    fun removeTaskFromDayList(taskId: String) {
        ensureDayList()
        if (todayList().entries.none { it.taskId == taskId }) return
        val task = findTask(taskId)
        recordChange("day_list", "Removed \"${truncateTitle(task?.title ?: taskId)}\" from today's list")
        replaceTodayList { list -> list.copy(entries = normalizedEntries(list.entries.filter { it.taskId != taskId })) }
        // T093: eject is information, not ignoring — record it and clear the ignore streak.
        upsertTraySignal(taskId) { it.copy(lastOutcome = TrayOutcome.Ejected, ignoredStreak = 0) }
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

    // Full replacement order for today's list. Unknown/duplicate ids are ignored; entries missing
    // from the request keep their previous relative order at the end. A no-op records nothing.
    fun reorderDayList(orderedTaskIds: List<String>) {
        ensureDayList()
        val list = todayList()
        val byTaskId = list.entries.associateBy { it.taskId }
        val requested = orderedTaskIds.distinct().filter { it in byTaskId }
        val requestedSet = requested.toHashSet()
        val current = list.entries.sortedBy { it.order }
        val next = requested.map { byTaskId.getValue(it) } + current.filter { it.taskId !in requestedSet }
        if (next.map { it.taskId } == current.map { it.taskId }) return
        recordChange("day_list", "Reordered today's list")
        replaceTodayList { it.copy(entries = normalizedEntries(next)) }
        persist()
    }

    // Pin (or clear, with null) a display time on a list entry. Pins are sort/display only — the
    // capacity gauge owns the "does the day fit" question. Invalid times are rejected silently.
    fun setDayListPin(taskId: String, pinnedTime: String?) {
        ensureDayList()
        val entry = todayList().entries.find { it.taskId == taskId } ?: return
        if (pinnedTime != null && !validTime(pinnedTime)) return
        if (entry.pinnedTime == pinnedTime) return
        val title = truncateTitle(findTask(taskId)?.title ?: taskId)
        recordChange("day_list", if (pinnedTime != null) "Pinned \"$title\" at $pinnedTime" else "Unpinned \"$title\"")
        replaceTodayList { list ->
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

    // Inline instant add: create a minimal task and put it on today's list as ONE undoable change.
    // AI enrichment is a SEPARATE follow-up step (T105); nothing here calls a model.
    fun instantCaptureToDayList(title: String): String? {
        val cleaned = title.trim()
        if (cleaned.isEmpty()) return null
        ensureDayList() // materialize the morning list BEFORE the snapshot so undo keeps it
        recordChange("capture", "Captured \"${truncateTitle(cleaned)}\" to today's list")
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
        replaceTodayList { list ->
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

    // --- T095: conscious release --------------------------------------------------------------------

    // "Let go" — guilt-free, distinct from archive: the task archives with released=true and its
    // entry leaves today's list, as one undoable change.
    fun releaseTask(taskId: String) {
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return
        ensureDayList() // materialize before the snapshot so undo keeps it (instantCapture pattern)
        recordChange("day_list", "Let go: \"${truncateTitle(task.title)}\"")
        updateTaskIn(taskId) { it.copy(status = TaskStatus.Archived, released = true) }
        replaceTodayList { list -> list.copy(entries = normalizedEntries(list.entries.filter { it.taskId != taskId })) }
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
            addExecutionEvent(
                ExecutionEventType.WorkedOn,
                taskIds = listOf(timer.taskId),
                planItemId = "plan_${state.currentDate}_${timer.taskId}",
                actualMinutes = actual
            )
        }
        persist()
        return actual
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

    fun updateTask(taskId: String, patch: TaskPatch) {
        val task = findTask(taskId) ?: return
        recordChange("manual_edit", "Updated task \"${truncateTitle(task.title)}\"")
        updateTaskIn(taskId) { current ->
            var next = current
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
            patch.dueDate?.takeIf { validDate(it) }?.let { next = next.copy(dueDate = it) }
            patch.scheduledDate?.takeIf { validDate(it) }?.let { next = next.copy(scheduledDate = it) }
            patch.scheduledTime?.takeIf { validTime(it) }?.let { next = next.copy(scheduledTime = it) }
            patch.energy?.let { next = next.copy(energy = it) }
            patch.strictness?.let { next = next.copy(strictness = it) }
            // T092: explicit per-task habit flag (boolean only; false clears it).
            patch.habit?.let { next = next.copy(habit = if (it) true else null) }
            patch.repeatPolicy?.let { next = next.copy(repeatPolicy = it) }
            next
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
    val repeatPolicy: RepeatPolicy? = null,
    val dueDate: String? = null,
    val scheduledDate: String? = null,
    val scheduledTime: String? = null,
    val completionBehavior: CompletionBehavior? = null,
    val definitionOfDone: String? = null,
    val strictness: Strictness? = null,
    val energy: Energy? = null
)
