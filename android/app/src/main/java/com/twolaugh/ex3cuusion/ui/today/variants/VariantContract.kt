package com.twolaugh.ex3cuusion.ui.today.variants

import com.twolaugh.ex3cuusion.core.domain.StaleResolution

// T109: the ONE seam between a layout variant and the app. Every variant body consumes the same
// UiState (ui.view = DayListView) and calls back through this interface only; the host wires each
// method straight to the matching AppViewModel function (the signatures mirror AppViewModel
// 1:1 — resolveStale takes the real StaleResolution enum rather than a raw string so the wiring
// is a method reference, not a parse).
//
// Variant body signature (the contract every variant file implements):
//   @Composable fun XTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier)
// plus a balance presentation:
//   @Composable fun XBalance(ui: UiState, modifier: Modifier = Modifier)
// shown by the host (bottom sheet today) when the variant calls actions.openBalance().
interface VariantActions {
    fun tick(taskId: String)
    fun removeFromList(taskId: String)
    fun reorder(orderedTaskIds: List<String>)
    fun reorderHabits(orderedTaskIds: List<String>)
    fun startTimer(taskId: String)
    fun instantCapture(title: String)
    fun addFromTray(taskId: String)
    fun resolveStale(taskId: String, resolution: StaleResolution)
    fun carriedToSomeday(taskId: String)
    fun letGo(taskId: String)
    fun openBalance()
    // Open the host-level TaskSheet for a task (grip-press menu Edit/Log, habit-strip edit taps).
    fun openTask(taskId: String)
    // Archive from the grip-press menu (the menu confirms inline before calling this).
    fun archiveTask(taskId: String)
}
