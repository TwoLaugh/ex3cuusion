@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInParent
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.twolaugh.ex3cuusion.core.domain.CloseoutView
import com.twolaugh.ex3cuusion.core.domain.DayListGauges
import com.twolaugh.ex3cuusion.core.domain.DayListHabitView
import com.twolaugh.ex3cuusion.core.domain.DayListPillarShare
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// --- shared formatting helpers --------------------------------------------------------------------

internal fun formatDuration(minutes: Int): String {
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours > 0 && rest > 0 -> "${hours}h ${rest}m"
        hours > 0 -> "${hours}h"
        else -> "${rest}m"
    }
}

// T092 balance gauge palette: stable desaturated warm tones hashed from the folder id, ported
// 1:1 from the web (page.tsx pillarTone) so both runtimes color a pillar identically.
// Distinct-but-calm hues: at gauge size the old near-identical browns read as one murky line
// (adb zoom review, 2026-06-11). Hue separation does the work now; saturation stays low.
private val pillarTones = listOf(
    Color(0xFFB07A45), Color(0xFF7F8B5E), Color(0xFF8B6F8F),
    Color(0xFF5E8B8B), Color(0xFFB5A36B), Color(0xFF9C5F55)
)

internal fun pillarTone(folderId: String): Color {
    var hash = 0
    for (ch in folderId) hash = hash * 31 + ch.code // wraps mod 2^32 exactly like the JS >>> 0
    return pillarTones[(hash.toUInt() % pillarTones.size.toUInt()).toInt()]
}

private val HEADER_DATE_FORMAT = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.UK)

// --- the screen ------------------------------------------------------------------------------------

@Composable
fun TodayScreen(viewModel: AppViewModel, onOpenSettings: () -> Unit = {}) {
    val ui by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LifecycleResumeEffect(Unit) {
        viewModel.syncClock()
        onPauseOrDispose { }
    }

    // T105: async results (enrichment applied / bad API key) surface as snackbars.
    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(
        containerColor = Ex3Colors.bg,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        val view = ui.view ?: return@Scaffold
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
        ) {
            // Slim sticky timer bar: pinned above the scrollable column so it never scrolls away.
            val timer = ui.activeTimer
            if (timer != null) {
                TimerBar(
                    timer = timer,
                    title = ui.activeTimerTitle ?: timer.taskId,
                    onPause = viewModel::pauseTimer,
                    onResume = viewModel::resumeTimer,
                    onStop = viewModel::stopTimer
                )
            }

            val focusManager = LocalFocusManager.current
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    // Taps on empty space release the inline-add cursor (user feedback: the
                    // typing marker used to stick around after an abandoned add).
                    .pointerInput(Unit) { detectTapGestures(onTap = { focusManager.clearFocus() }) }
                    .padding(horizontal = 20.dp)
            ) {
                Spacer(Modifier.height(16.dp))

                TodayHeader(
                    date = view.date,
                    doneCount = view.entries.count { it.completedToday },
                    undoEnabled = ui.canUndo,
                    onUndo = {
                        val summary = viewModel.undo()
                        if (summary != null) {
                            scope.launch { snackbarHostState.showSnackbar("Undid: $summary") }
                        }
                    },
                    onCloseDay = viewModel::closeDay,
                    onOpenSettings = onOpenSettings
                )

                if (ui.closeoutVisible && ui.closeout != null) {
                    Spacer(Modifier.height(16.dp))
                    CloseoutCard(closeout = ui.closeout!!, onDismiss = viewModel::dismissCloseout)
                }

                Spacer(Modifier.height(20.dp))
                GaugesRow(gauges = view.gauges)

                val median = view.gauges.medianDoneCount
                val unticked = view.entries.count { !it.completedToday }
                if (median != null && unticked > median + 3) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "$unticked unticked — your usual day finishes around $median",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.missed
                    )
                }

                if (view.habits.isNotEmpty()) {
                    Spacer(Modifier.height(20.dp))
                    SectionLabel("HABITS")
                    Spacer(Modifier.height(8.dp))
                    HabitStrip(habits = view.habits, onToggle = viewModel::tick, onReorder = viewModel::reorderHabits)
                }

                Spacer(Modifier.height(24.dp))
                SectionLabel("LIST")
                Spacer(Modifier.height(2.dp))
                DayListSection(
                    entries = view.entries,
                    enrichingTaskIds = ui.enrichingTaskIds,
                    timerRunning = ui.activeTimer != null,
                    onTick = viewModel::tick,
                    onRemove = viewModel::removeFromList,
                    onReorder = viewModel::reorder,
                    onStartTimer = viewModel::startTimer,
                    onSomeday = viewModel::carriedToSomeday,
                    onLetGo = viewModel::letGo,
                    onCapture = viewModel::instantCapture
                )

                val tray = view.tray
                val suggestionCount = tray.due.size + tray.balance.size + tray.backlog.size
                if (suggestionCount > 0) {
                    Spacer(Modifier.height(24.dp))
                    TrayCard(
                        tray = tray,
                        untickedCount = unticked,
                        onAdd = viewModel::addFromTray,
                        onResolveStale = viewModel::resolveStale
                    )
                }

                Spacer(Modifier.height(40.dp))
            }
        }
    }
}

// --- header ----------------------------------------------------------------------------------------

@Composable
private fun TodayHeader(
    date: String,
    doneCount: Int,
    undoEnabled: Boolean,
    onUndo: () -> Unit,
    onCloseDay: () -> Unit,
    onOpenSettings: () -> Unit
) {
    Row(verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f)) {
            Text(
                text = runCatching { LocalDate.parse(date).format(HEADER_DATE_FORMAT) }.getOrDefault(date),
                style = MaterialTheme.typography.titleLarge, // 22sp / 500
                color = Ex3Colors.ink
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "your list · $doneCount done",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkMuted
            )
        }
        IconButton(onClick = onUndo, enabled = undoEnabled) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Undo,
                contentDescription = "Undo last change",
                tint = if (undoEnabled) Ex3Colors.inkMuted else Ex3Colors.inkFaint.copy(alpha = 0.5f)
            )
        }
        var menuOpen by remember { mutableStateOf(false) }
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(
                    imageVector = Icons.Filled.MoreVert,
                    contentDescription = "More actions",
                    tint = Ex3Colors.inkMuted
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text("Close the day", style = MaterialTheme.typography.bodyMedium) },
                    onClick = {
                        menuOpen = false
                        onCloseDay()
                    }
                )
                DropdownMenuItem(
                    text = { Text("Settings", style = MaterialTheme.typography.bodyMedium) },
                    onClick = {
                        menuOpen = false
                        onOpenSettings()
                    }
                )
            }
        }
    }
}

// --- gauges ----------------------------------------------------------------------------------------

@Composable
private fun GaugesRow(gauges: DayListGauges) {
    Row(horizontalArrangement = Arrangement.spacedBy(20.dp), modifier = Modifier.fillMaxWidth()) {
        val overfull = gauges.listMinutes > gauges.capacityMinutes
        val ratio = when {
            gauges.capacityMinutes > 0 -> (gauges.listMinutes.toFloat() / gauges.capacityMinutes).coerceAtMost(1f)
            gauges.listMinutes > 0 -> 1f
            else -> 0f
        }

        // Capacity: accent fill on a raised track; overfull -> full bar + amber numbers.
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "capacity",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ex3Colors.inkFaint,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "${formatDuration(gauges.listMinutes)} of ${formatDuration(gauges.capacityMinutes)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (overfull) Ex3Colors.missed else Ex3Colors.inkMuted
                )
            }
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Ex3Colors.raised)
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(ratio)
                        .height(3.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Ex3Colors.accent)
                )
            }
        }

        // Balance: stacked pillar shares in desaturated warm tones + amber missing-pillar nudge.
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "balance",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ex3Colors.inkFaint,
                    modifier = Modifier.weight(1f)
                )
                val missing = gauges.missingPillars.firstOrNull()
                if (missing != null) {
                    Text(
                        text = "no $missing yet",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.missed
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            BalanceBar(shares = gauges.balance)
        }
    }
}

@Composable
internal fun BalanceBar(shares: List<DayListPillarShare>) {
    // 2dp gaps + 5dp height + a minimum visual share: six segments must be countable at a glance.
    Row(
        Modifier
            .fillMaxWidth()
            .height(5.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Ex3Colors.raised),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        for (pillar in shares) {
            val share = pillar.share.toFloat().coerceAtLeast(0.04f)
            if (pillar.share <= 0.0) continue
            Box(
                Modifier
                    .weight(share)
                    .height(5.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(pillarTone(pillar.folderId))
            )
        }
    }
}

// --- habit strip -----------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HabitStrip(
    habits: List<DayListHabitView>,
    onToggle: (String) -> Unit,
    onReorder: (List<String>) -> Unit
) {
    // All habits visible at once; chips support BOTH gestures: hold still to complete, hold and
    // MOVE to rearrange. Chips render in committed order during a drag (reordering composition
    // mid-gesture kills the gesture coroutine, same trap as the list rows); the dragged chip
    // floats via translation and the new order commits on release.
    val order = habits.map { it.taskId }
    val chipBounds = remember { mutableStateMapOf<String, androidx.compose.ui.geometry.Rect>() }
    var dragChipId by remember { mutableStateOf<String?>(null) }
    var dragDelta by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }

    fun pendingOrder(): List<String>? {
        val id = dragChipId ?: return null
        val from = chipBounds[id] ?: return null
        val center = from.center + dragDelta
        val target = order
            .filter { it in chipBounds }
            .minByOrNull { (chipBounds.getValue(it).center - center).getDistanceSquared() }
            ?: return null
        if (target == id) return null
        val mutable = order.toMutableList()
        mutable.remove(id)
        mutable.add(order.indexOf(target).coerceAtMost(mutable.size), id)
        return mutable
    }

    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        for (habit in habits) {
            androidx.compose.runtime.key(habit.taskId) {
                val dragging = dragChipId == habit.taskId
                Box(
                    Modifier
                        .zIndex(if (dragging) 1f else 0f)
                        .graphicsLayer {
                            if (dragging) {
                                translationX = dragDelta.x
                                translationY = dragDelta.y
                                alpha = 0.85f
                            }
                        }
                        .onGloballyPositioned { chipBounds[habit.taskId] = it.boundsInParent() }
                ) {
                    HabitChip(
                        habit = habit,
                        onToggle = { onToggle(habit.taskId) },
                        onDragStart = {
                            dragChipId = habit.taskId
                            dragDelta = androidx.compose.ui.geometry.Offset.Zero
                        },
                        onDragBy = { dragDelta += it },
                        onDragEnd = { cancelled ->
                            val next = if (cancelled) null else pendingOrder()
                            dragChipId = null
                            dragDelta = androidx.compose.ui.geometry.Offset.Zero
                            if (next != null) onReorder(next)
                        }
                    )
                }
            }
        }
    }
}

// Compact display name: everything before the first long-form separator. "Seal technique —
// moisturise within 30s post-shower" reads as "Seal technique" on a chip.
private fun habitShortName(title: String): String {
    var cut = title.split(" — ", " - ", " – ").first().trim()
    if (cut.length > 24) cut = cut.split(" + ").first().trim()
    return if (cut.length > 24) cut.take(23).trimEnd() + "…" else cut
}

// A short letterspaced section label — the at-a-glance separator between zones of the screen.
@Composable
internal fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = androidx.compose.ui.unit.TextUnit(1.8f, androidx.compose.ui.unit.TextUnitType.Sp)),
        color = Ex3Colors.inkFaint
    )
}

@Composable
private fun HabitChip(
    habit: DayListHabitView,
    onToggle: () -> Unit,
    onDragStart: () -> Unit = {},
    onDragBy: (androidx.compose.ui.geometry.Offset) -> Unit = {},
    onDragEnd: (Boolean) -> Unit = {}
) {
    val ticked = habit.completedToday
    // One gesture, two outcomes: hold STILL and the fill commits the tick; MOVE past slop and the
    // hold cancels into a rearrange drag.
    val hold = rememberHoldToComplete()
    val settle = remember { Animatable(1f) }
    val haptics = androidx.compose.ui.platform.LocalHapticFeedback.current
    LaunchedEffect(ticked) {
        if (ticked) {
            settle.snapTo(1.08f)
            settle.animateTo(1f, tween(240))
        }
    }
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = if (ticked) Ex3Colors.inkMuted else Color.Transparent,
        border = if (ticked) null else androidx.compose.foundation.BorderStroke(1.dp, Ex3Colors.inkFaint),
        modifier = Modifier
            // tactility: the chip squeezes as the hold fill grows, then settles on commit
            .scale(settle.value * (1f - 0.05f * hold.progress.value))
            .pointerInput(habit.taskId) {
                val slop = 12.dp.toPx()
                kotlinx.coroutines.coroutineScope {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        down.consume()
                        var total = androidx.compose.ui.geometry.Offset.Zero
                        var draggingChip = false
                        val fill = launch {
                            haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove)
                            hold.progress.animateTo(1f, tween(450))
                            haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                            onToggle()
                            hold.progress.snapTo(0f)
                        }
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id }
                            if (change == null) break
                            if (!change.pressed) {
                                change.consume()
                                break
                            }
                            val delta = change.positionChange()
                            total += delta
                            if (!draggingChip && (kotlin.math.abs(total.x) > slop || kotlin.math.abs(total.y) > slop)) {
                                draggingChip = true
                                fill.cancel()
                                launch { hold.progress.animateTo(0f, tween(100)) }
                                haptics.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                                onDragStart()
                                onDragBy(total)
                            } else if (draggingChip) {
                                onDragBy(delta)
                            }
                            change.consume()
                        }
                        if (draggingChip) {
                            onDragEnd(false)
                        } else if (hold.progress.value < 1f) {
                            fill.cancel()
                            launch { hold.progress.animateTo(0f, tween(140)) }
                        }
                    }
                }
            }
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
            modifier = Modifier
                .drawBehind {
                    if (!ticked && hold.progress.value > 0f) {
                        drawRect(
                            color = Ex3Colors.accent.copy(alpha = 0.22f),
                            size = size.copy(width = size.width * hold.progress.value)
                        )
                    }
                }
                .padding(horizontal = 11.dp, vertical = 7.dp)
        ) {
            if (ticked) {
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = Ex3Colors.bg,
                    modifier = Modifier.size(13.dp)
                )
            }
            Text(
                text = habitShortName(habit.title),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                color = if (ticked) Ex3Colors.bg else Ex3Colors.ink
            )
            if (habit.streak >= 2) {
                Icon(
                    imageVector = Icons.Filled.LocalFireDepartment,
                    contentDescription = "${habit.streak} day streak",
                    tint = Ex3Colors.accent,
                    modifier = Modifier.size(12.dp)
                )
                Text(
                    text = "${habit.streak}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ex3Colors.accent
                )
            }
        }
    }
}

// --- close-out card --------------------------------------------------------------------------------

@Composable
private fun CloseoutCard(closeout: CloseoutView, onDismiss: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Ex3Colors.surface,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Day closed — ${closeout.doneCount} done",
                    style = MaterialTheme.typography.titleMedium,
                    color = Ex3Colors.ink,
                    modifier = Modifier.weight(1f)
                )
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "×", color = Ex3Colors.inkMuted, style = MaterialTheme.typography.titleMedium)
                }
            }

            if (closeout.minutesByPillar.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                BalanceBar(shares = closeout.minutesByPillar)
            }

            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (closeout.streaksKept > 0) {
                    Icon(
                        imageVector = Icons.Filled.LocalFireDepartment,
                        contentDescription = null,
                        tint = Ex3Colors.accent,
                        modifier = Modifier.size(13.dp)
                    )
                }
                Text(
                    text = buildString {
                        append("${closeout.habitsTicked} of ${closeout.habitsTotal} habits")
                        if (closeout.streaksKept > 0) append(" · ${closeout.streaksKept} streaks kept")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ex3Colors.inkMuted
                )
            }

            // 7-day heat strip: intensity by done/planned, today (the last cell) highlighted.
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (day in closeout.weekStrip) {
                    val intensity = when {
                        day.plannedCount > 0 -> (day.doneCount.toFloat() / day.plannedCount).coerceIn(0f, 1f)
                        day.doneCount > 0 -> 1f
                        else -> 0f
                    }
                    val isToday = day.date == closeout.date
                    Box(
                        modifier = Modifier
                            .size(16.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(
                                if (intensity > 0f) Ex3Colors.accent.copy(alpha = 0.18f + 0.82f * intensity)
                                else Ex3Colors.raised
                            )
                            .then(
                                if (isToday) Modifier.border(1.dp, Ex3Colors.ink.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                                else Modifier
                            )
                    )
                }
            }

            if (closeout.carriedForward > 0) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "carried to tomorrow: ${closeout.carriedForward}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ex3Colors.inkMuted
                )
            }
        }
    }
}
