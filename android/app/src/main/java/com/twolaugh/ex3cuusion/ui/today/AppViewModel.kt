package com.twolaugh.ex3cuusion.ui.today

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.twolaugh.ex3cuusion.core.ai.CaptureEnricher
import com.twolaugh.ex3cuusion.core.ai.EnrichmentContext
import com.twolaugh.ex3cuusion.core.ai.EnrichmentFailure
import com.twolaugh.ex3cuusion.core.ai.EnrichmentResult
import com.twolaugh.ex3cuusion.core.domain.CloseoutView
import com.twolaugh.ex3cuusion.core.domain.DayListView
import com.twolaugh.ex3cuusion.core.domain.DomainEngine
import com.twolaugh.ex3cuusion.core.domain.PagesView
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.core.domain.TaskPatch
import com.twolaugh.ex3cuusion.core.domain.addDays
import com.twolaugh.ex3cuusion.core.domain.buildPagesView
import com.twolaugh.ex3cuusion.core.domain.findDayList
import com.twolaugh.ex3cuusion.core.domain.folderPath
import com.twolaugh.ex3cuusion.core.domain.habitStreak
import com.twolaugh.ex3cuusion.core.domain.taskProgressMinutes
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.model.ActiveTimer
import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import com.twolaugh.ex3cuusion.core.store.StateStore
import com.twolaugh.ex3cuusion.core.store.UndoStack
import com.twolaugh.ex3cuusion.core.store.normalizeState
import com.twolaugh.ex3cuusion.ui.settings.SettingsStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// T104: everything the Today screen needs in one immutable snapshot, re-derived after every
// mutation (the StateFlow equivalent of the web's payload refetch).
data class UiState(
    // T110: `view` is the view for (planningDate ?: today) — while planning, every variant body
    // renders tomorrow through the same contract without knowing.
    val view: DayListView? = null,
    // T110 planning mode: the future date being planned, or null for the normal Today surface.
    val planningDate: String? = null,
    val activeTimer: ActiveTimer? = null,
    val activeTimerTitle: String? = null,
    val canUndo: Boolean = false,
    val lastChangeSummary: String? = null,
    val closeoutVisible: Boolean = false,
    val closeout: CloseoutView? = null,
    // T105: captures with an AI enrichment call in flight (the row shows a "filing..." glimmer).
    val enrichingTaskIds: Set<String> = emptySet()
)

// T104 app wiring: owns the DomainEngine + StateStore + UndoStack (no DI framework — the app has
// exactly one screen and one state document). Every mutation goes through the engine, which
// persists via the StateStore; the ViewModel then re-renders the day list into a fresh UiState.
class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val store = StateStore(application.filesDir)
    private val undoStack = UndoStack(File(application.filesDir, "history.json"))
    private val engine: DomainEngine

    // T105: AI settings (key/model/switch) + the enricher factory (injectable shape kept for the
    // future; production always builds the real HTTPS enricher).
    val settings = SettingsStore(application)

    // Close-out presentation state, in-memory only (v1: forgotten on process death, per ticket).
    private val manuallyClosedDates = mutableSetOf<String>()
    private val dismissedCloseoutDates = mutableSetOf<String>()

    // T105: captures whose enrichment call is in flight.
    private val enrichingTaskIds = mutableSetOf<String>()

    // T110 planning mode: the future date the Today surface is pointed at (null = today). All
    // day-list mutations route their date through activeDate(), so the variant bodies and the
    // warm-dark composition work unchanged while planning.
    private var planningDate: String? = null

    private fun activeDate(): String = planningDate ?: engine.state.currentDate

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    // One-shot snackbar messages (enrichment results land asynchronously, after the capture).
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    init {
        // First run: an empty-but-valid state — NO demo tasks, just the "Personal" pillar that
        // normalizeState guarantees. Real data arrives via the T107 import bridge.
        val initial = store.load() ?: store.save(firstRunState())
        engine = DomainEngine(initial, undoStack, store)
        // B1: the day window lives in SettingsStore (transient config — the engine stays JSON-
        // state pure). Applied here, and re-applied + re-rendered on every settings change so the
        // capacity gauge reflects the new window in the next render.
        engine.setDayWindow(settings.dayStart, settings.dayEnd)
        syncClock()
        viewModelScope.launch {
            settings.dayWindowFlow.collect { (start, end) ->
                engine.setDayWindow(start, end)
                refresh()
            }
        }
        // Mirrors the web's live clock: a 60s ticker keeps currentDate/currentTime on the device
        // clock, so missed pins update and the day rolls naturally at midnight.
        viewModelScope.launch {
            while (true) {
                delay(60_000)
                syncClock()
            }
        }
    }

    // Sync the state clock from the device (also called on resume). Re-render only when the
    // minute actually changed; setClock persists but is intentionally not undoable.
    fun syncClock() {
        val now = LocalDateTime.now()
        val date = now.toLocalDate().toString()
        val time = now.format(TIME_FORMAT)
        if (engine.state.currentDate != date || engine.state.currentTime != time) {
            engine.setClock(date, time)
        }
        refresh()
    }

    private fun firstRunState(): AppState {
        val now = LocalDateTime.now()
        return normalizeState(
            AppState(
                currentDate = now.toLocalDate().toString(),
                currentTime = now.format(TIME_FORMAT),
                // Web-compat only: Android capacity derives from the Settings day window (B1);
                // this field rides along in the document for the web, which still reads it.
                availableMinutes = 300
            )
        )
    }

    private fun refresh() {
        // T110: when the planned date arrives (the clock ticked past midnight), planning mode is
        // over — the surface snaps back to "today", which now IS the planned list (reconciled by
        // ensureDayList on first view).
        if (planningDate != null && planningDate!! <= engine.state.currentDate) planningDate = null
        val planning = planningDate
        val view = engine.dayListView(planning ?: engine.state.currentDate)
        val date = view.date
        val allTicked = view.entries.isNotEmpty() && view.entries.all { it.completedToday }
        // Close-out is a today ritual: never shown over the planning surface.
        val closeoutVisible = planning == null &&
            (allTicked || date in manuallyClosedDates) && date !in dismissedCloseoutDates
        val timer = engine.state.activeTimer
        _uiState.value = UiState(
            view = view,
            planningDate = planning,
            activeTimer = timer,
            activeTimerTitle = timer?.let { active -> engine.state.tasks.find { it.id == active.taskId }?.title },
            canUndo = undoStack.size > 0,
            lastChangeSummary = engine.listChangeHistory().firstOrNull()?.summary,
            closeoutVisible = closeoutVisible,
            closeout = if (closeoutVisible) engine.closeoutView(date) else null,
            enrichingTaskIds = enrichingTaskIds.toSet()
        )
    }

    // --- T110 plan tomorrow -------------------------------------------------------------------------

    // Point the Today surface at tomorrow. Entering pre-seeds tomorrow's list (due recurring +
    // a live carryover preview of today's unfinished) via the engine's ensureDayList.
    fun enterPlanning() {
        planningDate = addDays(engine.state.currentDate, 1)
        refresh()
    }

    fun exitPlanning() {
        planningDate = null
        refresh()
    }

    // --- mutations (each: engine call -> persist inside the engine -> re-render) ------------------

    fun tick(taskId: String) {
        engine.completeTaskDirect(taskId)
        refresh()
    }

    fun removeFromList(taskId: String) {
        engine.removeTaskFromDayList(taskId, activeDate())
        refresh()
    }

    fun reorder(orderedTaskIds: List<String>) {
        engine.reorderDayList(orderedTaskIds, activeDate())
        refresh()
    }

    fun reorderHabits(orderedTaskIds: List<String>) {
        engine.reorderHabitTasks(orderedTaskIds)
        refresh()
    }

    fun addFromTray(taskId: String) {
        engine.addTaskToDayList(taskId, DayListSource.Tray, activeDate())
        refresh()
    }

    fun instantCapture(title: String) {
        val taskId = engine.instantCaptureToDayList(title, activeDate())
        refresh()
        if (taskId != null) enrichCapture(taskId)
    }

    // T105: best-effort async enrichment of a fresh capture. The network call runs on IO; the
    // engine mutation and UI refresh come back to Main (the engine is not thread-safe). Failures
    // are silent except a bad key — the one thing the user can actually fix.
    private fun enrichCapture(taskId: String) {
        if (!settings.enrichmentActive) return
        val state = engine.state
        val task = state.tasks.find { it.id == taskId } ?: return
        val context = EnrichmentContext(
            currentDate = state.currentDate,
            currentTime = state.currentTime,
            folderPaths = state.folders
                .filter { it.status != FolderStatus.Archived }
                .mapNotNull { folderPath(state, it.id) },
            effortMinutes = task.effortMinutes,
            priority = task.priority,
            importance = task.importance,
            urgency = task.urgency,
            completionBehavior = wireName(task.completionBehavior),
            completionMode = task.completionMode?.let { wireName(it) }
        )
        val enricher = CaptureEnricher(apiKey = settings.apiKey, model = settings.model)
        enrichingTaskIds.add(taskId)
        _uiState.value = _uiState.value.copy(enrichingTaskIds = enrichingTaskIds.toSet())
        viewModelScope.launch(Dispatchers.IO) {
            val result = try {
                enricher.enrich(task.title, context)
            } catch (e: Exception) { // belt and braces: enrichment must never crash capture
                EnrichmentResult.Failure(EnrichmentFailure.Network, e.message)
            }
            withContext(Dispatchers.Main) {
                enrichingTaskIds.remove(taskId)
                when (result) {
                    is EnrichmentResult.Success -> {
                        val applied = engine.applyEnrichment(taskId, result.revision)
                        refresh()
                        if (applied != null) _messages.tryEmit(enrichmentSnackbar(applied.folderName, applied.changes))
                    }
                    is EnrichmentResult.Failure -> {
                        refresh() // clears the "filing..." glimmer
                        if (result.reason == EnrichmentFailure.Auth) {
                            _messages.tryEmit("Couldn't reach AI — check your API key in Settings")
                        }
                    }
                }
            }
        }
    }

    // The wire literal of a @SerialName-annotated enum value (e.g. ExhaustOnce -> "exhaust_once").
    private inline fun <reified T : Enum<T>> wireName(value: T): String =
        kotlinx.serialization.json.Json.encodeToString(
            kotlinx.serialization.serializer<T>(), value
        ).trim('"')

    private fun enrichmentSnackbar(folderName: String?, changes: List<String>): String {
        val summary = changes.filterNot { folderName != null && it.startsWith("moved under") }.take(2).joinToString(" · ")
        val parts = listOfNotNull(folderName, summary.takeIf { it.isNotEmpty() })
        return "AI filed: ${parts.joinToString(" · ").ifEmpty { "no changes" }}"
    }

    fun resolveStale(taskId: String, resolution: StaleResolution) {
        engine.resolveStaleTask(taskId, resolution)
        refresh()
    }

    // Carry-nudge "someday": off the active list AND demoted to the spaced someday schedule. Two
    // engine mutations, so undo rewinds them one at a time (both fully covered).
    fun carriedToSomeday(taskId: String) {
        engine.removeTaskFromDayList(taskId, activeDate())
        engine.resolveStaleTask(taskId, StaleResolution.Someday)
        refresh()
    }

    fun letGo(taskId: String) {
        engine.releaseTask(taskId)
        refresh()
    }

    // --- TASK SHEET (grip-press menu + habit-strip edit state are its only entry points) ----------

    fun archive(taskId: String) {
        engine.archiveTask(taskId)
        refresh()
    }

    // Sheet save: ONE undoable change covering the changed fields, with the day-list pin for the
    // active (or planning) date kept in sync with the patched pinned time.
    fun saveTask(taskId: String, patch: TaskPatch) {
        engine.updateTask(taskId, patch, syncPinDate = activeDate())
        refresh()
    }

    fun logProgress(taskId: String, minutes: Int) {
        engine.logTaskProgress(taskId, minutes)
        refresh()
    }

    // The sheet's read model, derived fresh from engine state on every recomposition (the host
    // recomposes after each mutation's refresh, so the progress row stays live after a log).
    fun taskSheetData(taskId: String): TaskSheetData? {
        val state = engine.state
        val task = state.tasks.find { it.id == taskId && it.status != TaskStatus.Archived } ?: return null
        val date = activeDate()
        val entry = findDayList(state, date)?.entries?.find { it.taskId == taskId }
        return TaskSheetData(
            taskId = task.id,
            title = task.title,
            folderId = task.folderId,
            folderPath = task.folderId?.let { folderPath(state, it) },
            effortMinutes = task.effortMinutes,
            dueDate = task.dueDate,
            pinnedTime = entry?.pinnedTime ?: task.scheduledTime,
            tags = task.tags ?: emptyList(),
            habit = task.habit == true,
            repeatSummary = repeatSummaryText(task.repeatPolicy),
            streak = habitStreak(state, task, state.currentDate),
            progressMinutesToday = taskProgressMinutes(state, task.id, state.currentDate),
            folderOptions = state.folders
                .filter { it.status != FolderStatus.Archived }
                .mapNotNull { folder -> folderPath(state, folder.id)?.let { FolderOption(folder.id, it) } }
                .sortedBy { it.path.lowercase() }
        )
    }

    fun startTimer(taskId: String) {
        if (planningDate != null) return // T110: timers are a today act; the bar is hidden anyway
        engine.startTaskTimer(taskId)
        refresh()
    }

    fun pauseTimer() {
        engine.pauseTaskTimer()
        refresh()
    }

    fun resumeTimer() {
        engine.resumeTaskTimer()
        refresh()
    }

    fun stopTimer(complete: Boolean) {
        engine.stopTaskTimer(complete)
        refresh()
    }

    // Undo the most recent change; returns its summary for the snackbar (null = nothing to undo).
    fun undo(): String? {
        val undone = engine.listChangeHistory().firstOrNull() ?: return null
        engine.undoChange()
        refresh()
        return undone.summary
    }

    // --- T108: Pages surface (additive — nothing above this section changed) ----------------------

    private val _pagesView = MutableStateFlow(PagesView())
    val pagesView: StateFlow<PagesView> = _pagesView.asStateFlow()

    // The Pages screens re-pull on entry (LaunchedEffect) and after every pages mutation; the
    // Today pipeline is untouched.
    fun refreshPages() {
        _pagesView.value = buildPagesView(engine.state)
    }

    // B3: the "jot to the dump..." field — quick jots APPEND to the dump note (the inbox) as
    // timestamped lines instead of creating new documents.
    fun jotToDump(body: String) {
        engine.appendToDump(body)
        refreshPages()
        refresh() // keep canUndo/lastChangeSummary on the Today surface honest
    }

    // B3: read telemetry on editor open (recents ordering). Not undoable, no history — only the
    // pages read model needs re-pulling.
    fun markNoteViewed(noteId: String) {
        engine.markDocumentViewed(noteId)
        refreshPages()
    }

    fun createNote(folderId: String, body: String, title: String? = null): String {
        val id = engine.createDocument(folderId, body, title)
        refreshPages()
        refresh()
        return id
    }

    fun updateNote(noteId: String, title: String?, body: String?) {
        engine.updateDocument(noteId, title = title, body = body)
        refreshPages()
        refresh()
    }

    fun deleteNote(noteId: String) {
        engine.deleteDocument(noteId)
        refreshPages()
        refresh()
    }

    fun setFolderColor(folderId: String, index: Int) {
        engine.setFolderColor(folderId, index)
        refreshPages()
        refresh()
    }

    fun closeDay() {
        if (planningDate != null) return // T110: close-out is today-only (hidden while planning)
        manuallyClosedDates.add(engine.state.currentDate)
        refresh()
    }

    fun dismissCloseout() {
        dismissedCloseoutDates.add(engine.state.currentDate)
        refresh()
    }

    private companion object {
        val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    }
}
