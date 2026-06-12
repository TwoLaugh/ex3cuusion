package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.DayList
import com.twolaugh.ex3cuusion.core.model.DayListEntry
import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.model.Energy
import com.twolaugh.ex3cuusion.core.model.ExecutionEventType
import com.twolaugh.ex3cuusion.core.model.Task
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.model.TaskType
import com.twolaugh.ex3cuusion.core.model.TrayOutcome
import com.twolaugh.ex3cuusion.core.model.TraySignal
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// T092/T093/T095: full translation of src/lib/day-list.ts — the list-first Today brain. The
// day's commitment is the user's hand-authored LIST; the system ADVISES it (tray, gauges, habit
// strip) instead of authoring the day. Everything here is a pure function over AppState; because
// the Kotlin model is immutable, the one read path that learns on read (tray surfacing telemetry)
// returns the updated AppState alongside the view instead of mutating in place like the TS.

// Sources that represent user intent and therefore carry over to the next day when unfinished.
// "recurring" entries do NOT carry — the next morning build re-adds them if they are due again.
private val CARRIED_SOURCES = setOf(DayListSource.Manual, DayListSource.Tray, DayListSource.Ai, DayListSource.Carried)

private const val MAX_STREAK_WALK_DAYS = 365
private const val TRAY_BACKLOG_LIMIT = 5
private const val TRAY_BALANCE_LIMIT = 3

// T093 HARD constraints (product-definition): acceptance learning may DAMPEN a task but never
// suppress it to zero — any active non-habit task unsurfaced for TRAY_FLOOR_DAYS gets a
// guaranteed backlog slot — and aging escalates to a QUESTION, never an automatic archive.
private const val TRAY_FLOOR_DAYS = 7
internal const val STALE_QUESTION_STREAK = 5
private val SOMEDAY_RESURFACE_INTERVALS = listOf(7, 14, 30, 90)
private const val END_OF_EVENING = "22:30"
private const val UNDATED_DELAY_HORIZON_DAYS = 21

// T095 WIP gentleness: the median nudge needs at least this many completed days of history.
private const val WIP_MEDIAN_MIN_DAYS = 5

// --- Read-model data classes (in-memory views, never serialized) --------------------------------

data class DayListEntryView(
    val taskId: String,
    val title: String,
    val folderId: String? = null,
    val folderPath: String? = null,
    val pinnedTime: String? = null,
    val source: DayListSource,
    val order: Int,
    val effortMinutes: Int,
    val completedToday: Boolean,
    // Display metadata: the pinned time has passed and the entry is still unticked.
    val missedPin: Boolean = false,
    // T095 carry honesty: consecutive mornings this entry has carried forward.
    val carriedCount: Int? = null,
    // T095: at 3+ carries the row offers split / someday / release inline.
    val carryNudge: Boolean = false,
    // Sum of this date's worked_on minutes (timer stops + manual progress logs).
    val progressMinutesToday: Int = 0
)

data class DayListHabitView(
    val taskId: String,
    val title: String,
    val effortMinutes: Int,
    val completedToday: Boolean,
    val streak: Int,
    // Sum of this date's worked_on minutes (timer stops + manual progress logs).
    val progressMinutesToday: Int = 0
)

data class DayListTrayTask(
    val taskId: String,
    val title: String,
    val folderId: String? = null,
    val folderPath: String? = null,
    val effortMinutes: Int,
    val dueDate: String? = null,
    val scheduledDate: String? = null,
    // For balance suggestions: the missing pillar this task would fill.
    val pillarName: String? = null,
    // T093: the calibrated effort fits the gap before the next pinned anchor.
    val fitsGap: Boolean,
    // T093: big (>= 90m) AND vague (no definitionOfDone) — suggest splitting it.
    val suggestSplit: Boolean,
    // T093: ignored on >= 5 distinct days — ask someday/keep instead of dropping it.
    val staleQuestion: Boolean,
    // T093: a someday task brought back by the spaced 7/14/30/90 schedule.
    val resurfaced: Boolean,
    // T093: the folder's actual/estimate calibration ratio when it differs from 1.0.
    val calibrationRatio: Double? = null,
    // T093: number of blocked subtasks this (parent) task would free up.
    val unblocks: Int? = null
)

data class DayListPillarShare(
    val folderId: String,
    val name: String,
    val minutes: Int,
    val share: Double
)

data class DayListGauges(
    val capacityMinutes: Int,
    val listMinutes: Int,
    // T093: listMinutes re-estimated through per-folder actual/estimate ratios.
    val calibratedListMinutes: Int,
    // Pillar mix (top-ancestor folder) of list + habit tasks, completed included.
    val balance: List<DayListPillarShare>,
    val missingPillars: List<String>,
    // T095 WIP gentleness: median completed-day size over past days (null until >= 5 days of
    // completion history exist). The UI nudges, descriptively, when the list exceeds it.
    val medianDoneCount: Int? = null
)

data class DayListTray(
    val due: List<DayListTrayTask>,
    val balance: List<DayListTrayTask>,
    val backlog: List<DayListTrayTask>,
    // T093: minutes until the next upcoming pinned anchor (else ~22:30).
    val gapMinutes: Int
)

data class DayListView(
    val date: String,
    val committedAt: String,
    val entries: List<DayListEntryView>,
    val habits: List<DayListHabitView>,
    val tray: DayListTray,
    val gauges: DayListGauges
)

// renderDayList learns on read (tray surfacing telemetry); the updated state rides along.
data class RenderedDayList(val view: DayListView, val state: AppState)

// --- T095 close-out views ------------------------------------------------------------------------

data class CloseoutDoneRow(
    val taskId: String,
    val title: String,
    val pillarName: String? = null,
    // actualMinutes from a single-task completion when the timer recorded one, else the estimate.
    val minutes: Int
)

data class CloseoutWeekDay(val date: String, val plannedCount: Int, val doneCount: Int)

data class CloseoutView(
    val date: String,
    val done: List<CloseoutDoneRow>,
    val doneCount: Int,
    val minutesByPillar: List<DayListPillarShare>,
    val habitsTicked: Int,
    val habitsTotal: Int,
    // Habits ticked on this date that extended an existing run (streak >= 2 including today).
    val streaksKept: Int,
    // Unfinished user-intent entries that the next morning build will carry forward.
    val carriedForward: Int,
    // Last 7 days ending on `date` (T091 week heat-strip).
    val weekStrip: List<CloseoutWeekDay>
)

// --- Lookup helpers ------------------------------------------------------------------------------

fun findDayList(state: AppState, date: String): DayList? = state.dayLists.find { it.date == date }

fun findTraySignal(state: AppState, taskId: String): TraySignal? =
    state.traySignals.find { it.taskId == taskId }

internal fun blankTraySignal(taskId: String): TraySignal =
    TraySignal(taskId = taskId, surfacedCount = 0, addedCount = 0, ignoredStreak = 0)

// Silent first-access build for a date (state.ts ensureDayList): returns the existing list or a
// freshly built morning list plus the state now containing it. No history is recorded here.
// T110: building for a FUTURE date is allowed (plan-ahead); and the first access of TODAY's list
// when it was authored on an earlier date (planned ahead — committedAt before the date) runs the
// one-shot midnight reconcile instead of returning the stored list as-is.
fun ensureDayList(state: AppState, date: String): Pair<DayList, AppState> {
    val existing = findDayList(state, date)
    if (existing != null) {
        if (date == state.currentDate && existing.committedAt.take(10) < date) {
            val reconciled = reconcileDayList(state, existing)
            return reconciled to state.copy(
                dayLists = state.dayLists.map { if (it.date == date) reconciled else it }
            )
        }
        return existing to state
    }
    val built = buildMorningList(state, date)
    return built to state.copy(dayLists = state.dayLists + built)
}

// T110 midnight reconcile (RECONCILE, not rebuild): align a planned-ahead list with what actually
// happened between planning and the date beginning, keeping the user's authored order.
//   - drop entries whose task is gone, archived, or completed (exhaust-once status, or — for
//     user-intent carried-source entries — ticked between the planning evening and this date;
//     recurring entries are NOT dropped for an earlier-day tick, exactly like a morning build,
//     which re-adds a daily task regardless of yesterday's completion);
//   - append, at the end, anything a fresh morning build would now include that the plan lacks:
//     newly unfinished carryovers from the previous list (source carried, carriedCount chained)
//     and newly-due recurring/dated tasks (source recurring/manual);
//   - bump committedAt to now, so the pass runs exactly once (afterwards it is a normal list).
internal fun reconcileDayList(state: AppState, list: DayList): DayList {
    val taskById = state.tasks.associateBy { it.id }
    // The late-completion window: planning evening .. the day before this date (bounded for
    // pathological committedAt values; the plan-tomorrow flow makes this a single day).
    val windowStart = maxOf(list.committedAt.take(10), addDays(list.date, -31))
    val kept = list.entries.sortedBy { it.order }.filter { entry ->
        val task = taskById[entry.taskId] ?: return@filter false
        if (task.status == TaskStatus.Archived || task.status == TaskStatus.Completed) return@filter false
        if (entry.source in CARRIED_SOURCES) {
            var cursor = windowStart
            while (cursor < list.date) {
                if (taskCompletedOnDate(state, task, cursor)) return@filter false
                cursor = addDays(cursor, 1)
            }
        }
        true
    }
    val keptIds = kept.mapTo(HashSet()) { it.taskId }
    val appended = buildMorningList(state, list.date).entries.filter { it.taskId !in keptIds }
    return list.copy(
        committedAt = stateTimestamp(state),
        entries = (kept + appended).mapIndexed { index, entry -> entry.copy(order = index) }
    )
}

// --- Morning build -------------------------------------------------------------------------------

// Morning build for `date`:
//   (a) due recurring non-habit tasks (planner due/plannable semantics), source "recurring";
//   (b) tasks dated today (scheduledDate/dueDate == date), source "recurring" if they repeat
//       else "manual";
//   (c) unfinished manual/tray/ai/carried entries from the most recent previous list, re-added
//       with source "carried" and carriedCount incremented (T095 carry honesty).
// Dedupe by taskId with priority a > b > c. Order: recurring/dated by taskScore desc, then
// carried in their previous relative order. pinnedTime carries from task.scheduledTime when the
// task is scheduled for this date.
fun buildMorningList(state: AppState, date: String): DayList {
    val plannable = state.tasks.filter { task ->
        task.habit != true && !hasActiveChildren(state, task.id) && isTaskPlannable(task, date)
    }
    val recurringDue = plannable.filter { !it.repeatPolicy.isNone && it.completionBehavior != CompletionBehavior.KeepAsSuggestion }
    val datedToday = plannable.filter { it.scheduledDate == date || it.dueDate == date }
    val scored = dedupeTasks(recurringDue + datedToday).sortedByDescending { taskScore(state, it, date) }

    val previous = state.dayLists.filter { it.date < date }.maxByOrNull { it.date }
    val carried: List<Pair<Task, Int>> = (previous?.entries ?: emptyList())
        .filter { it.source in CARRIED_SOURCES }
        .sortedBy { it.order }
        .mapNotNull { entry ->
            val task = state.tasks.find { it.id == entry.taskId } ?: return@mapNotNull null
            if (task.habit == true) return@mapNotNull null
            // completed/archived/blocked/waiting do not carry
            if (task.status != TaskStatus.Active && task.status != TaskStatus.Scheduled) return@mapNotNull null
            // a repeatable ticked that day is finished, not unfinished
            if (taskCompletedOnDate(state, task, previous!!.date)) return@mapNotNull null
            // e.g. the user re-dated it to another day
            if (!isTaskPlannable(task, date)) return@mapNotNull null
            task to ((entry.carriedCount ?: 0) + 1)
        }

    val entries = mutableListOf<DayListEntry>()
    val seen = mutableSetOf<String>()
    fun push(task: Task, source: DayListSource, carriedCount: Int? = null) {
        if (!seen.add(task.id)) return
        entries.add(
            DayListEntry(
                taskId = task.id,
                order = entries.size,
                pinnedTime = if (task.scheduledDate == date && task.scheduledTime != null) task.scheduledTime else null,
                source = source,
                carriedCount = carriedCount
            )
        )
    }
    for (task in scored) push(task, if (!task.repeatPolicy.isNone) DayListSource.Recurring else DayListSource.Manual)
    for ((task, count) in carried) push(task, DayListSource.Carried, count)

    return DayList(date = date, committedAt = stateTimestamp(state), entries = entries)
}

// state.ts changeTimestamp/stateTimestamp: the state clock as an ISO instant.
fun stateTimestamp(state: AppState): String = "${state.currentDate}T${state.currentTime}:00.000Z"

// --- Render --------------------------------------------------------------------------------------

// The read model the Today surface consumes: the list (sorted by order — pins are display
// metadata, not a sort key), the habit strip with streaks, the tray (due / balance / backlog),
// and the capacity + pillar-balance gauges. Surfacing telemetry is recorded into the returned
// state (idempotent per date), mirroring the web's persist-on-read pattern.
//
// T110 future dates (plan-ahead rendering, date > currentDate), kept deliberately simple:
//   - gauges use the FULL-day capacity baseline (no current-clock subtraction);
//   - the day has not started, so every pin is "upcoming": the gap runs from midnight to the
//     first pin (else end of evening) — at that size effectively everything fits the gap;
//   - the time-of-day energy damping is skipped (tonight's hour says nothing about tomorrow);
//     avoidance/backlog ranking stay as-is — they are date-relative, not clock-relative;
//   - recordTelemetry=false suppresses the surfacing write entirely: rendering tomorrow's tray
//     while planning must not teach the acceptance model (the engine passes the flag; the view
//     rows then read the unstamped signals, which only affects same-day display niceties).
fun renderDayList(state: AppState, list: DayList, recordTelemetry: Boolean = true): RenderedDayList {
    val date = list.date
    val isFutureDate = date > state.currentDate
    val nowMinutes = if (isFutureDate) 0 else timeToMinutes(state.currentTime)
    val taskById = state.tasks.associateBy { it.id }

    val entries = list.entries.sortedBy { it.order }.mapNotNull { entry ->
        val task = taskById[entry.taskId] ?: return@mapNotNull null
        if (task.status == TaskStatus.Archived) return@mapNotNull null
        val completedToday = taskCompletedOnDate(state, task, date)
        val missedPin = entry.pinnedTime != null && !completedToday && date == state.currentDate &&
            timeToMinutes(entry.pinnedTime) <= nowMinutes
        DayListEntryView(
            taskId = task.id,
            title = task.title,
            folderId = task.folderId,
            folderPath = task.folderId?.let { folderPath(state, it) },
            pinnedTime = entry.pinnedTime,
            source = entry.source,
            order = entry.order,
            effortMinutes = task.effortMinutes,
            completedToday = completedToday,
            missedPin = missedPin,
            carriedCount = entry.carriedCount,
            carryNudge = (entry.carriedCount ?: 0) >= 3,
            progressMinutesToday = taskProgressMinutes(state, task.id, date)
        )
    }

    val habitTasks = state.tasks.filter { it.habit == true && it.status != TaskStatus.Archived && isRepeatPolicyDue(it, date) }
    val habits = habitTasks.map { task ->
        DayListHabitView(
            taskId = task.id,
            title = task.title,
            effortMinutes = task.effortMinutes,
            completedToday = taskCompletedOnDate(state, task, date),
            streak = habitStreak(state, task, date),
            progressMinutesToday = taskProgressMinutes(state, task.id, date)
        )
    }

    // Tray candidates: plannable, non-habit, not already on the list, not already ticked today.
    val listTaskIds = list.entries.mapTo(HashSet()) { it.taskId }
    val trayCandidates = state.tasks.filter { task ->
        task.habit != true &&
            task.id !in listTaskIds &&
            !hasActiveChildren(state, task.id) &&
            isTaskPlannable(task, date) &&
            !taskCompletedOnDate(state, task, date)
    }

    // Due: recurring-due or dated/deadline (incl. overdue) work the user removed or never added.
    val due = trayCandidates.filter { task ->
        task.completionBehavior != CompletionBehavior.KeepAsSuggestion &&
            (!task.repeatPolicy.isNone || task.scheduledDate == date || (task.dueDate != null && task.dueDate <= date))
    }
    val dueIds = due.mapTo(HashSet()) { it.id }

    // T093 gap-aware: minutes until the next upcoming, unticked pinned anchor (else end of evening).
    val upcomingPinMinutes = list.entries.mapNotNull { entry ->
        val pinned = entry.pinnedTime ?: return@mapNotNull null
        val pinnedMinutes = timeToMinutes(pinned)
        if (pinnedMinutes <= nowMinutes) return@mapNotNull null
        val task = taskById[entry.taskId] ?: return@mapNotNull null
        if (taskCompletedOnDate(state, task, date)) return@mapNotNull null // a done anchor no longer bounds the gap
        pinnedMinutes
    }
    val gapMinutes = max(0, (upcomingPinMinutes.minOrNull() ?: timeToMinutes(END_OF_EVENING)) - nowMinutes)

    // T093 unblocker-first (LIMITED): the one detectable "completing this frees work" shape is a
    // parent whose live subtasks are ALL blocked — surface it with an `unblocks` count.
    val blockedChildCounts = mutableMapOf<String, Int>()
    val parentsWithLiveUnblockedChild = mutableSetOf<String>()
    for (task in state.tasks) {
        val parentId = task.parentTaskId ?: continue
        if (task.status == TaskStatus.Archived || task.status == TaskStatus.Completed) continue
        if (task.status == TaskStatus.Blocked) blockedChildCounts[parentId] = (blockedChildCounts[parentId] ?: 0) + 1
        else parentsWithLiveUnblockedChild.add(parentId)
    }
    val unblockerParents = state.tasks.filter { task ->
        task.id in blockedChildCounts &&
            task.id !in parentsWithLiveUnblockedChild &&
            task.habit != true &&
            task.id !in listTaskIds &&
            task.completionBehavior != CompletionBehavior.KeepAsSuggestion &&
            task.type != TaskType.SoftInvitation &&
            isTaskPlannable(task, date) &&
            !taskCompletedOnDate(state, task, date)
    }

    // T093 backlog: TMT-ranked, acceptance-damped, floor-guaranteed selection. Someday tasks are
    // excluded except on their spaced resurfacing schedule. Ranking/selection read the PRE-stamp
    // signals (today's surfacing is recorded after selection, like the TS).
    val rankContext = BacklogRankContext(
        gapMinutes = gapMinutes,
        avoidanceActive = avoidancePatternActive(state, date, trayCandidates),
        highEnergyLowYield = !isFutureDate && isLowYieldHourForHighEnergy(state)
    )
    val backlogPool = buildList {
        for (task in trayCandidates) {
            if (task.id in dueIds) continue
            if (task.completionBehavior == CompletionBehavior.KeepAsSuggestion || task.type == TaskType.SoftInvitation) continue
            add(task to null)
        }
        for (task in unblockerParents) add(task to blockedChildCounts[task.id])
    }.mapNotNull { (task, unblocks) ->
        val someday = somedaySchedule(state, task, date)
        if (someday.excluded) return@mapNotNull null
        BacklogRow(
            task = task,
            rank = backlogRank(state, task, date, rankContext.copy(unblocks = unblocks)),
            resurfaced = someday.resurfaced,
            unblocks = unblocks
        )
    }
    val backlogRows = selectBacklog(state, date, backlogPool)

    // Pillar mix of the committed day (list entries + habits, completed included).
    val mixTasks = entries.mapNotNull { taskById[it.taskId] } + habitTasks
    val presentPillarIds = mixTasks.mapTo(HashSet()) { topAncestorFolder(state, it.folderId)?.id ?: "unfiled" }
    val pillars = state.folders.filter { it.parentFolderId == null && it.status != com.twolaugh.ex3cuusion.core.model.FolderStatus.Archived }
    val missingPillarFolders = pillars.filter { it.id !in presentPillarIds }
    val missingPillarIds = missingPillarFolders.mapTo(HashSet()) { it.id }

    // Balance fillers: soft invitations whose pillar is missing from the day's mix.
    val balanceTray = trayCandidates
        .map { task -> task to topAncestorFolder(state, task.folderId) }
        .filter { (task, pillar) ->
            (task.completionBehavior == CompletionBehavior.KeepAsSuggestion || task.type == TaskType.SoftInvitation) &&
                pillar != null && pillar.id in missingPillarIds
        }
        .take(TRAY_BALANCE_LIMIT)

    // T093 telemetry: every task the tray shows today is recorded as surfaced (idempotent per
    // date). The TS mutates state on read; here the stamped signals land in the returned state,
    // and the tray row views below read the POST-stamp signals exactly like the TS does.
    // T110: suppressed for plan-ahead renders — surfacing tomorrow's tray is not an offer today.
    val stampedState = if (recordTelemetry) {
        recordTraySurfacing(
            state,
            date,
            due.map { it.id } + balanceTray.map { it.first.id } + backlogRows.map { it.task.id }
        )
    } else {
        state
    }

    // T093 calibrated capacity: per-folder actual/estimate ratios re-price the remaining list.
    val calibration = buildTrayCalibration(state)
    val uncompletedEntries = entries.filter { !it.completedToday }
    val listMinutes = uncompletedEntries.sumOf { it.effortMinutes }
    val calibratedListMinutes = uncompletedEntries
        .sumOf { it.effortMinutes * calibration.ratioFor(taskById[it.taskId]?.folderId) }
        .roundToInt()
    val minutesByPillar = pillarMinutes(state, mixTasks)

    return RenderedDayList(
        view = DayListView(
            date = date,
            committedAt = list.committedAt,
            entries = entries,
            habits = habits,
            tray = DayListTray(
                due = due.map { trayTaskView(stampedState, it, TrayTaskViewOptions(gapMinutes, calibration)) },
                balance = balanceTray.map { (task, pillar) ->
                    trayTaskView(stampedState, task, TrayTaskViewOptions(gapMinutes, calibration, pillarName = pillar?.name))
                },
                backlog = backlogRows.map { row ->
                    trayTaskView(
                        stampedState,
                        row.task,
                        TrayTaskViewOptions(gapMinutes, calibration, resurfaced = row.resurfaced, unblocks = row.unblocks)
                    )
                },
                gapMinutes = gapMinutes
            ),
            gauges = DayListGauges(
                capacityMinutes = calculateCapacity(state, fullDay = isFutureDate),
                listMinutes = listMinutes,
                calibratedListMinutes = calibratedListMinutes,
                balance = minutesByPillar,
                missingPillars = missingPillarFolders.map { it.name },
                medianDoneCount = medianDoneCount(state, date)
            )
        ),
        state = stampedState
    )
}

// Pillar-mix minutes/shares for a set of tasks (raw estimates, like the TS gauges).
private fun pillarMinutes(state: AppState, tasks: List<Task>): List<DayListPillarShare> {
    val buckets = LinkedHashMap<String, Pair<String, Int>>() // folderId -> (name, minutes)
    for (task in tasks) {
        val pillar = topAncestorFolder(state, task.folderId)
        val key = pillar?.id ?: "unfiled"
        val name = pillar?.name ?: "Unfiled"
        val current = buckets[key]?.second ?: 0
        buckets[key] = name to (current + task.effortMinutes)
    }
    val total = buckets.values.sumOf { it.second }
    return buckets.map { (folderId, value) ->
        DayListPillarShare(
            folderId = folderId,
            name = value.first,
            minutes = value.second,
            share = if (total > 0) value.second.toDouble() / total else 0.0
        )
    }.sortedByDescending { it.minutes }
}

// Completion semantics shared by the list, habit strip, and tray: a task counts as done on a date
// when a completion/execution event for that date includes it, or its completedAt/lastCompletedAt
// falls on that date (covers repeatable tasks, whose status snaps back to "active").
fun taskCompletedOnDate(state: AppState, task: Task, date: String): Boolean {
    if (task.completedAt?.take(10) == date || task.lastCompletedAt?.take(10) == date) return true
    if (state.completions.any { it.date == date && it.taskIds?.contains(task.id) == true }) return true
    return state.executionEvents.any { event ->
        event.date == date && event.type == ExecutionEventType.Completed &&
            (event.taskId == task.id || event.taskIds?.contains(task.id) == true)
    }
}

// Sum of a date's worked_on minutes for a task (timer stops + manual progress logs) — the
// progressMinutesToday view field's single source of truth.
fun taskProgressMinutes(state: AppState, taskId: String, date: String): Int =
    state.executionEvents
        .filter { event ->
            event.date == date && event.type == ExecutionEventType.WorkedOn &&
                (event.taskId == taskId || event.taskIds?.contains(taskId) == true)
        }
        .sumOf { it.actualMinutes ?: 0 }

// Habit streak: consecutive completed days ending today (or yesterday, so an unticked morning
// does not zero the streak). Derived from the persistent history plus lastCompletedAt; capped at
// a year.
fun habitStreak(state: AppState, task: Task, today: String): Int {
    val completedDates = mutableSetOf<String>()
    for (event in state.completions) {
        if (event.taskIds?.contains(task.id) == true) completedDates.add(event.date)
    }
    for (event in state.executionEvents) {
        if (event.type == ExecutionEventType.Completed && (event.taskId == task.id || event.taskIds?.contains(task.id) == true)) {
            completedDates.add(event.date)
        }
    }
    task.lastCompletedAt?.let { completedDates.add(it.take(10)) }

    var cursor = if (today in completedDates) today else addDays(today, -1)
    var streak = 0
    while (streak < MAX_STREAK_WALK_DAYS && cursor in completedDates) {
        streak += 1
        cursor = addDays(cursor, -1)
    }
    return streak
}

// --- T093 intelligent-tray machinery -------------------------------------------------------------

// Surfacing update, idempotent per date: a task already stamped with today's date is skipped, so
// repeated same-day reads never grow counts. ignoredStreak/lastOutcome are PROVISIONAL — an add
// or eject (Mutations) overwrites them the moment the user acts.
internal fun recordTraySurfacing(state: AppState, date: String, taskIds: List<String>): AppState {
    var signals = state.traySignals
    var changed = false
    for (taskId in LinkedHashSet(taskIds)) {
        val existing = signals.find { it.taskId == taskId }
        if (existing?.lastSurfacedDate == date) continue
        val base = existing ?: blankTraySignal(taskId)
        val updated = base.copy(
            surfacedCount = base.surfacedCount + 1,
            firstSurfacedDate = base.firstSurfacedDate ?: date,
            lastSurfacedDate = date,
            ignoredStreak = base.ignoredStreak + 1,
            lastOutcome = TrayOutcome.Ignored
        )
        signals = if (existing == null) signals + updated else signals.map { if (it.taskId == taskId) updated else it }
        changed = true
    }
    return if (changed) state.copy(traySignals = signals) else state
}

private enum class Clarity { High, Medium, Low }

// Expectancy proxy: a written definition of done or a small bite is "I know how to finish this";
// big AND vague is the classic stall shape (low expectancy + split suggestion).
private fun clarityLevel(task: Task): Clarity = when {
    !task.definitionOfDone.isNullOrEmpty() || task.effortMinutes <= 30 -> Clarity.High
    task.effortMinutes >= 90 -> Clarity.Low
    else -> Clarity.Medium
}

private data class BacklogRankContext(
    val gapMinutes: Int,
    val avoidanceActive: Boolean,
    val highEnergyLowYield: Boolean,
    val unblocks: Int? = null
)

// T093 TMT scoring for the tray backlog ONLY (planner taskScore is untouched):
//   rank = (value × expectancy) / delay-discount × damping × folderPropensity
//          × gapFit × energyFit × avoidanceBoost × unblockerBoost
private fun backlogRank(state: AppState, task: Task, date: String, context: BacklogRankContext): Double {
    val pillarWeight = topAncestorFolder(state, task.folderId)?.weight ?: 5
    val value = max(1.0, taskScore(state, task, date) + 2.0 * pillarWeight)
    val clarity = clarityLevel(task)
    val expectancy = when (clarity) {
        Clarity.High -> 1.2
        Clarity.Low -> 0.7
        Clarity.Medium -> 1.0
    }
    val signal = findTraySignal(state, task.id)
    val trayAgeDays = signal?.firstSurfacedDate?.let { max(0, daysUntil(it, date)) } ?: 0
    val delayDays = if (task.dueDate != null && task.dueDate > date) {
        daysUntil(date, task.dueDate)
    } else {
        max(0, UNDATED_DELAY_HORIZON_DAYS - trayAgeDays)
    }
    val delayDiscount = 1.0 + delayDays / 14.0
    // Acceptance damping (floor-guarded in selectBacklog): 5 ignored surfacings → ×0.4, never 0.
    val damping = 1.0 / (1.0 + 0.3 * min(signal?.ignoredStreak ?: 0, STALE_QUESTION_STREAK))
    val propensity = folderPropensityMultiplier(state, task.folderId)
    val gapFit = if (effectiveEffortMinutes(state, task) <= context.gapMinutes) 1.15 else 1.0
    val energyFit = if (task.energy == Energy.High && context.highEnergyLowYield) 0.8 else 1.0
    val avoidanceBoost = if (context.avoidanceActive && clarity == Clarity.High && task.effortMinutes <= 30) 1.5 else 1.0
    val unblockerBoost = 1.0 + 0.15 * min(context.unblocks ?: 0, 3)
    return ((value * expectancy) / delayDiscount) * damping * propensity * gapFit * energyFit * avoidanceBoost * unblockerBoost
}

// Gentle folder propensity: mean add-rate across the folder's surfaced tasks, mapped to ×0.8
// (never added) .. ×1.2 (always added). No data → ×1.0.
private fun folderPropensityMultiplier(state: AppState, folderId: String?): Double {
    if (folderId == null) return 1.0
    val rates = state.tasks
        .filter { it.folderId == folderId }
        .mapNotNull { findTraySignal(state, it.id) }
        .filter { it.surfacedCount > 0 }
        .map { min(1.0, it.addedCount.toDouble() / it.surfacedCount) }
    if (rates.isEmpty()) return 1.0
    val mean = rates.sum() / rates.size
    return max(0.8, min(1.2, 0.8 + 0.4 * mean))
}

// Avoidance signal: the last 3 days' completions are predominantly tiny (<= 15m) while at least
// one >= 60m candidate sat untouched — boost small CLEAR tasks to rebuild momentum.
private fun avoidancePatternActive(state: AppState, date: String, candidates: List<Task>): Boolean {
    val windowStart = addDays(date, -2)
    val completedTasks = mutableListOf<Task>()
    val completedIds = mutableSetOf<String>()
    for (event in state.completions) {
        if (event.date < windowStart || event.date > date) continue
        for (taskId in event.taskIds ?: emptyList()) {
            val task = state.tasks.find { it.id == taskId } ?: continue
            completedTasks.add(task)
            completedIds.add(task.id)
        }
    }
    if (completedTasks.size < 3) return false
    val smallShare = completedTasks.count { it.effortMinutes <= 15 }.toDouble() / completedTasks.size
    if (smallShare < 0.7) return false
    return candidates.any { it.effortMinutes >= 60 && it.id !in completedIds }
}

// Energy/time-of-day matching from "completed" executionEvents' createdAt hour. Cold start:
// fewer than 10 attributable completions → no-op. "Low-yield" = the current hour holds less than
// half the average per-observed-hour count of high-energy completions.
private fun isLowYieldHourForHighEnergy(state: AppState): Boolean {
    val samples = mutableListOf<Pair<Energy, Int>>()
    for (event in state.executionEvents) {
        if (event.type != ExecutionEventType.Completed) continue
        val hour = event.createdAt.drop(11).take(2).toIntOrNull() ?: continue
        val taskIds = event.taskIds ?: event.taskId?.let { listOf(it) } ?: emptyList()
        for (taskId in taskIds) {
            val task = state.tasks.find { it.id == taskId } ?: continue
            samples.add(task.energy to hour)
        }
    }
    if (samples.size < 10) return false
    val high = samples.filter { it.first == Energy.High }
    if (high.isEmpty()) return false
    val observedHours = high.mapTo(HashSet()) { it.second }
    val meanPerHour = high.size.toDouble() / observedHours.size
    val currentHour = state.currentTime.take(2).toIntOrNull() ?: return false
    val atCurrentHour = high.count { it.second == currentHour }
    return atCurrentHour < meanPerHour * 0.5
}

private data class SomedayScheduleResult(val excluded: Boolean, val resurfaced: Boolean)

// Spaced someday resurfacing: dateIntent "someday" tasks stay out of the backlog except on the
// 7/14/30/90-day schedule after lastSurfacedDate (interval index = surfacedCount). A someday task
// with no surfacing anchor surfaces once immediately to start the clock. A task already surfaced
// today stays for the day (idempotent re-reads) unless the user just resolved it.
private fun somedaySchedule(state: AppState, task: Task, date: String): SomedayScheduleResult {
    if (task.dateIntent?.kind != DateIntentKind.Someday) return SomedayScheduleResult(excluded = false, resurfaced = false)
    val signal = findTraySignal(state, task.id)
    val lastSurfacedDate = signal?.lastSurfacedDate
        ?: return SomedayScheduleResult(excluded = false, resurfaced = true)
    if (lastSurfacedDate == date) {
        return if (signal.lastOutcome == TrayOutcome.Ignored) {
            SomedayScheduleResult(excluded = false, resurfaced = true)
        } else {
            SomedayScheduleResult(excluded = true, resurfaced = false)
        }
    }
    val interval = SOMEDAY_RESURFACE_INTERVALS[min(signal.surfacedCount, SOMEDAY_RESURFACE_INTERVALS.size - 1)]
    return if (daysUntil(lastSurfacedDate, date) >= interval) {
        SomedayScheduleResult(excluded = false, resurfaced = true)
    } else {
        SomedayScheduleResult(excluded = true, resurfaced = false)
    }
}

private data class BacklogRow(
    val task: Task,
    val rank: Double,
    val resurfaced: Boolean,
    val unblocks: Int? = null
)

// Backlog selection with the HARD floor. Rank order decides, EXCEPT:
//   - sticky-for-the-day: tasks already surfaced today and not yet acted on are re-included, so
//     repeated same-day reads are stable and signals stay idempotent;
//   - floor (first read of a date): if the tray is full and no selected task is floor-due
//     (unsurfaced >= 7 days, incl. never surfaced), the lowest-ranked slot is given to the most
//     stale floor-due task — damping can NEVER exclude a floor-due task.
private fun selectBacklog(state: AppState, date: String, pool: List<BacklogRow>): List<BacklogRow> {
    fun staleness(row: BacklogRow): Int {
        val lastSurfaced = findTraySignal(state, row.task.id)?.lastSurfacedDate ?: return Int.MAX_VALUE
        return daysUntil(lastSurfaced, date)
    }
    fun isFloorDue(row: BacklogRow): Boolean = staleness(row) >= TRAY_FLOOR_DAYS
    fun isSticky(row: BacklogRow): Boolean {
        val signal = findTraySignal(state, row.task.id) ?: return false
        return signal.lastSurfacedDate == date && signal.lastOutcome == TrayOutcome.Ignored
    }

    val byRank = compareByDescending<BacklogRow> { it.rank }.thenBy { it.task.id }
    val ranked = pool.sortedWith(byRank)
    val sticky = ranked.filter(::isSticky)
    val rest = ranked.filterNot(::isSticky)
    var selected = (sticky + rest).take(TRAY_BACKLOG_LIMIT)

    if (sticky.isEmpty() && selected.size == TRAY_BACKLOG_LIMIT && selected.none(::isFloorDue)) {
        val selectedIds = selected.mapTo(HashSet()) { it.task.id }
        val floorPick = ranked
            .filter { it.task.id !in selectedIds && isFloorDue(it) }
            .sortedWith(
                compareByDescending<BacklogRow> { staleness(it) }
                    .thenBy { findTraySignal(state, it.task.id)?.surfacedCount ?: 0 }
                    .thenBy { it.task.id }
            )
            .firstOrNull()
        if (floorPick != null) selected = selected.take(TRAY_BACKLOG_LIMIT - 1) + floorPick
    }

    return selected.sortedWith(byRank)
}

internal fun interface TrayCalibration {
    fun ratioFor(folderId: String?): Double
}

// Calibrated capacity: actual/estimate ratio per folder from single-task completions that carry
// actualMinutes. A folder needs >= 3 samples; fallback is the global ratio (>= 3 samples), then
// 1.0. Clamped 0.5..2.5.
internal fun buildTrayCalibration(state: AppState): TrayCalibration {
    val samplesByFolder = mutableMapOf<String, MutableList<Double>>()
    val allSamples = mutableListOf<Double>()
    for (event in state.completions) {
        val actual = event.actualMinutes ?: continue
        if (actual <= 0) continue
        val taskIds = event.taskIds ?: continue
        if (taskIds.size != 1) continue
        val task = state.tasks.find { it.id == taskIds[0] } ?: continue
        if (task.effortMinutes <= 0) continue
        val ratio = actual.toDouble() / task.effortMinutes
        allSamples.add(ratio)
        samplesByFolder.getOrPut(task.folderId ?: "") { mutableListOf() }.add(ratio)
    }
    fun clampRatio(value: Double): Double = max(0.5, min(2.5, value))
    val globalRatio = if (allSamples.size >= 3) clampRatio(allSamples.average()) else null
    val folderRatios = samplesByFolder
        .filterValues { it.size >= 3 }
        .mapValues { (_, samples) -> clampRatio(samples.average()) }
    return TrayCalibration { folderId -> folderRatios[folderId ?: ""] ?: globalRatio ?: 1.0 }
}

internal data class TrayTaskViewOptions(
    val gapMinutes: Int,
    val calibration: TrayCalibration,
    val pillarName: String? = null,
    val resurfaced: Boolean? = null,
    val unblocks: Int? = null
)

internal fun trayTaskView(state: AppState, task: Task, options: TrayTaskViewOptions): DayListTrayTask {
    val signal = findTraySignal(state, task.id)
    val ratio = options.calibration.ratioFor(task.folderId)
    return DayListTrayTask(
        taskId = task.id,
        title = task.title,
        folderId = task.folderId,
        folderPath = task.folderId?.let { folderPath(state, it) },
        effortMinutes = task.effortMinutes,
        dueDate = task.dueDate,
        scheduledDate = task.scheduledDate,
        pillarName = options.pillarName,
        fitsGap = effectiveEffortMinutes(state, task) <= options.gapMinutes,
        suggestSplit = clarityLevel(task) == Clarity.Low,
        staleQuestion = (signal?.ignoredStreak ?: 0) >= STALE_QUESTION_STREAK,
        resurfaced = options.resurfaced ?: false,
        calibrationRatio = if (ratio != 1.0) (ratio * 100).roundToInt() / 100.0 else null,
        unblocks = options.unblocks
    )
}

private fun dedupeTasks(tasks: List<Task>): List<Task> {
    val seen = mutableSetOf<String>()
    return tasks.filter { seen.add(it.id) }
}

// --- T095: close-out + WIP gauge (implemented fresh from the ticket; no TS reference) -------------

// Distinct non-habit tasks completed on `date` (the close-out's "what got done" rows).
private fun completedTasksOn(state: AppState, date: String): List<Task> =
    state.tasks.filter { it.habit != true && taskCompletedOnDate(state, it, date) }

// The actual minutes a single-task completion recorded for this task on this date, if any.
private fun actualMinutesFor(state: AppState, taskId: String, date: String): Int? =
    state.completions.lastOrNull { event ->
        event.date == date && event.taskIds?.size == 1 && event.taskIds[0] == taskId && (event.actualMinutes ?: 0) > 0
    }?.actualMinutes

// T095 WIP gentleness: median completed-day size, from completion history STRICTLY BEFORE `date`.
// Needs >= 5 days with at least one completion, else null (the nudge stays silent). Even-sized
// histories take the rounded mean of the two middle values.
fun medianDoneCount(state: AppState, date: String): Int? {
    val byDate = mutableMapOf<String, MutableSet<String>>()
    for (event in state.completions) {
        if (event.date >= date) continue
        val ids = event.taskIds ?: continue
        if (ids.isEmpty()) continue
        byDate.getOrPut(event.date) { mutableSetOf() }.addAll(ids)
    }
    if (byDate.size < WIP_MEDIAN_MIN_DAYS) return null
    val counts = byDate.values.map { it.size }.sorted()
    val mid = counts.size / 2
    return if (counts.size % 2 == 1) counts[mid] else ((counts[mid - 1] + counts[mid]) / 2.0).roundToInt()
}

// T095 close-out: the quiet end-of-day card — what got done, minutes by pillar, habit ticks,
// streaks kept, what will carry, and the last-7-days week strip.
fun buildCloseout(state: AppState, date: String): CloseoutView {
    val done = completedTasksOn(state, date).map { task ->
        CloseoutDoneRow(
            taskId = task.id,
            title = task.title,
            pillarName = topAncestorFolder(state, task.folderId)?.name,
            minutes = actualMinutesFor(state, task.id, date) ?: task.effortMinutes
        )
    }

    // Minutes by pillar over the done rows, using timer actuals where available.
    val pillarBuckets = LinkedHashMap<String, Pair<String, Int>>()
    for (task in completedTasksOn(state, date)) {
        val pillar = topAncestorFolder(state, task.folderId)
        val key = pillar?.id ?: "unfiled"
        val name = pillar?.name ?: "Unfiled"
        val minutes = actualMinutesFor(state, task.id, date) ?: task.effortMinutes
        pillarBuckets[key] = name to ((pillarBuckets[key]?.second ?: 0) + minutes)
    }
    val pillarTotal = pillarBuckets.values.sumOf { it.second }
    val minutesByPillar = pillarBuckets.map { (folderId, value) ->
        DayListPillarShare(
            folderId = folderId,
            name = value.first,
            minutes = value.second,
            share = if (pillarTotal > 0) value.second.toDouble() / pillarTotal else 0.0
        )
    }.sortedByDescending { it.minutes }

    val habitTasks = state.tasks.filter { it.habit == true && it.status != TaskStatus.Archived && isRepeatPolicyDue(it, date) }
    val tickedHabits = habitTasks.filter { taskCompletedOnDate(state, it, date) }
    val streaksKept = tickedHabits.count { habitStreak(state, it, date) >= 2 }

    // What the next morning build will carry: unfinished user-intent entries on this date's list.
    val list = findDayList(state, date)
    val carriedForward = (list?.entries ?: emptyList()).count { entry ->
        if (entry.source !in CARRIED_SOURCES) return@count false
        val task = state.tasks.find { it.id == entry.taskId } ?: return@count false
        (task.status == TaskStatus.Active || task.status == TaskStatus.Scheduled) && !taskCompletedOnDate(state, task, date)
    }

    val weekStrip = (6 downTo 0).map { offset ->
        val day = addDays(date, -offset)
        val dayList = findDayList(state, day)
        val doneIds = mutableSetOf<String>()
        for (event in state.completions) {
            if (event.date == day) doneIds.addAll(event.taskIds ?: emptyList())
        }
        CloseoutWeekDay(date = day, plannedCount = dayList?.entries?.size ?: 0, doneCount = doneIds.size)
    }

    return CloseoutView(
        date = date,
        done = done,
        doneCount = done.size,
        minutesByPillar = minutesByPillar,
        habitsTicked = tickedHabits.size,
        habitsTotal = habitTasks.size,
        streaksKept = streaksKept,
        carriedForward = carriedForward,
        weekStrip = weekStrip
    )
}
