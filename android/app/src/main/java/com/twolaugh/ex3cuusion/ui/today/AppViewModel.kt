package com.twolaugh.ex3cuusion.ui.today

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.twolaugh.ex3cuusion.core.domain.CloseoutView
import com.twolaugh.ex3cuusion.core.domain.DayListView
import com.twolaugh.ex3cuusion.core.domain.DomainEngine
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.core.model.ActiveTimer
import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.DayListSource
import com.twolaugh.ex3cuusion.core.store.StateStore
import com.twolaugh.ex3cuusion.core.store.UndoStack
import com.twolaugh.ex3cuusion.core.store.normalizeState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// T104: everything the Today screen needs in one immutable snapshot, re-derived after every
// mutation (the StateFlow equivalent of the web's payload refetch).
data class UiState(
    val view: DayListView? = null,
    val activeTimer: ActiveTimer? = null,
    val activeTimerTitle: String? = null,
    val canUndo: Boolean = false,
    val lastChangeSummary: String? = null,
    val closeoutVisible: Boolean = false,
    val closeout: CloseoutView? = null
)

// T104 app wiring: owns the DomainEngine + StateStore + UndoStack (no DI framework — the app has
// exactly one screen and one state document). Every mutation goes through the engine, which
// persists via the StateStore; the ViewModel then re-renders the day list into a fresh UiState.
class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val store = StateStore(application.filesDir)
    private val undoStack = UndoStack(File(application.filesDir, "history.json"))
    private val engine: DomainEngine

    // Close-out presentation state, in-memory only (v1: forgotten on process death, per ticket).
    private val manuallyClosedDates = mutableSetOf<String>()
    private val dismissedCloseoutDates = mutableSetOf<String>()

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        // First run: an empty-but-valid state — NO demo tasks, just the "Personal" pillar that
        // normalizeState guarantees. Real data arrives via the T107 import bridge.
        val initial = store.load() ?: store.save(firstRunState())
        engine = DomainEngine(initial, undoStack, store)
        syncClock()
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
                availableMinutes = 300 // the web seed's default daily capacity
            )
        )
    }

    private fun refresh() {
        val view = engine.dayListView()
        val date = view.date
        val allTicked = view.entries.isNotEmpty() && view.entries.all { it.completedToday }
        val closeoutVisible = (allTicked || date in manuallyClosedDates) && date !in dismissedCloseoutDates
        val timer = engine.state.activeTimer
        _uiState.value = UiState(
            view = view,
            activeTimer = timer,
            activeTimerTitle = timer?.let { active -> engine.state.tasks.find { it.id == active.taskId }?.title },
            canUndo = undoStack.size > 0,
            lastChangeSummary = engine.listChangeHistory().firstOrNull()?.summary,
            closeoutVisible = closeoutVisible,
            closeout = if (closeoutVisible) engine.closeoutView(date) else null
        )
    }

    // --- mutations (each: engine call -> persist inside the engine -> re-render) ------------------

    fun tick(taskId: String) {
        engine.completeTaskDirect(taskId)
        refresh()
    }

    fun removeFromList(taskId: String) {
        engine.removeTaskFromDayList(taskId)
        refresh()
    }

    fun reorder(orderedTaskIds: List<String>) {
        engine.reorderDayList(orderedTaskIds)
        refresh()
    }

    fun addFromTray(taskId: String) {
        engine.addTaskToDayList(taskId, DayListSource.Tray)
        refresh()
    }

    fun instantCapture(title: String) {
        engine.instantCaptureToDayList(title)
        refresh()
    }

    fun resolveStale(taskId: String, resolution: StaleResolution) {
        engine.resolveStaleTask(taskId, resolution)
        refresh()
    }

    // Carry-nudge "someday": off today's list AND demoted to the spaced someday schedule. Two
    // engine mutations, so undo rewinds them one at a time (both fully covered).
    fun carriedToSomeday(taskId: String) {
        engine.removeTaskFromDayList(taskId)
        engine.resolveStaleTask(taskId, StaleResolution.Someday)
        refresh()
    }

    fun letGo(taskId: String) {
        engine.releaseTask(taskId)
        refresh()
    }

    fun startTimer(taskId: String) {
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

    fun closeDay() {
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
