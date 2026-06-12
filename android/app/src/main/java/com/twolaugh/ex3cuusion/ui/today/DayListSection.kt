package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DragIndicator
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.twolaugh.ex3cuusion.core.domain.DayListEntryView
import com.twolaugh.ex3cuusion.core.model.ActiveTimer
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset

// --- THE LIST --------------------------------------------------------------------------------------

internal val hairline = Color(0x14ECE7DC)

// Rows live in the screen's single scrollable column. Reorder is a dedicated GRIP HANDLE that
// drags immediately on touch (no long-press): a handle-scoped gesture can't lose the race against
// the scroll container or the swipe-to-dismiss the way the old whole-row long-press drag did on
// real hardware (user feedback, 2026-06-11). Long-press now belongs to hold-to-complete.
@Composable
internal fun DayListSection(
    entries: List<DayListEntryView>,
    enrichingTaskIds: Set<String> = emptySet(),
    timerRunning: Boolean,
    onTick: (String) -> Unit,
    onRemove: (String) -> Unit,
    onReorder: (List<String>) -> Unit,
    onStartTimer: (String) -> Unit,
    onSomeday: (String) -> Unit,
    onLetGo: (String) -> Unit,
    onCapture: (String) -> Unit,
    onOpenTask: (String) -> Unit = {},
    onArchive: (String) -> Unit = {}
) {
    val taskIds = entries.map { it.taskId }
    val firstUntickedId = entries.firstOrNull { !it.completedToday }?.taskId

    var dragId by remember { mutableStateOf<String?>(null) }
    // Total finger travel since drag start: drives the dragged row's visual translation.
    var dragTotal by remember { mutableFloatStateOf(0f) }
    var dragOrder by remember { mutableStateOf<List<String>?>(null) }
    val rowHeights = remember { mutableStateMapOf<String, Int>() }

    val byId = entries.associateBy { it.taskId }
    // CRITICAL: rows always render in the COMMITTED order. Reordering the composition mid-drag
    // recreates the dragged row's node and cancels its gesture coroutine (found via logcat,
    // 2026-06-11) — the pending order is shown purely with translation offsets instead, and the
    // real reorder commits on release.
    val displayOrder = taskIds

    // Position-based pending order: ONE calculation drives both the visual shifts and the final
    // commit, so what you see mid-drag is exactly what lands (the old incremental swap math could
    // disagree with its own preview around variable-height rows).
    fun moveDraggedRow(amountY: Float) {
        val id = dragId ?: return
        dragTotal += amountY
        val base = taskIds.indexOf(id)
        if (base < 0) return
        val heights = taskIds.map { (rowHeights[it] ?: 0).toFloat() }
        val draggedCenter = heights.take(base).sum() + heights[base] / 2f + dragTotal
        val without = taskIds.filter { it != id }
        var cursor = 0f
        var insertPos = without.size
        for ((i, rowId) in without.withIndex()) {
            val h = (rowHeights[rowId] ?: 0).toFloat()
            if (draggedCenter < cursor + h / 2f) {
                insertPos = i
                break
            }
            cursor += h
        }
        dragOrder = without.toMutableList().apply { add(insertPos, id) }
    }

    fun endDrag(cancelled: Boolean) {
        val finalOrder = dragOrder
        dragId = null
        dragTotal = 0f
        dragOrder = null
        if (!cancelled && finalOrder != null && finalOrder != taskIds) onReorder(finalOrder)
    }

    Column(Modifier.fillMaxWidth()) {
        if (entries.isEmpty()) {
            Text(
                text = "Nothing on your list — pull from the tray or type below.",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkFaint,
                modifier = Modifier.padding(vertical = 16.dp)
            )
        }

        for (id in displayOrder) {
            val entry = byId[id] ?: continue
            key(id) {
                val isDragging = dragId == id
                // Visual shift while a drag is live: the dragged row follows the finger; any row
                // displaced in the pending order slides by the dragged row's height.
                val pendingShift = if (!isDragging && dragOrder != null) {
                    val from = taskIds.indexOf(id)
                    val to = dragOrder!!.indexOf(id)
                    if (from >= 0 && to >= 0 && from != to) {
                        (if (to > from) 1 else -1) * (rowHeights[dragId] ?: 0).toFloat()
                    } else 0f
                } else 0f
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onSizeChanged { rowHeights[id] = it.height }
                        .zIndex(if (isDragging) 1f else 0f)
                        .graphicsLayer { translationY = if (isDragging) dragTotal else pendingShift }
                ) {
                    DismissibleListRow(
                        entry = entry,
                        isNow = entry.taskId == firstUntickedId,
                        isDragging = isDragging,
                        anyDragging = dragId != null,
                        isEnriching = entry.taskId in enrichingTaskIds,
                        showPlay = entry.taskId == firstUntickedId && !timerRunning,
                        onTick = { onTick(entry.taskId) },
                        onRemove = { onRemove(entry.taskId) },
                        onStartTimer = { onStartTimer(entry.taskId) },
                        onSomeday = { onSomeday(entry.taskId) },
                        onLetGo = { onLetGo(entry.taskId) },
                        onOpenTask = { onOpenTask(entry.taskId) },
                        onArchive = { onArchive(entry.taskId) },
                        onDragStart = {
                            dragId = id
                            dragTotal = 0f
                            dragOrder = taskIds
                        },
                        onDragBy = { moveDraggedRow(it) },
                        onDragEnd = { endDrag(cancelled = false) },
                        onDragCancel = { endDrag(cancelled = true) }
                    )
                }
                HorizontalDivider(thickness = 0.5.dp, color = hairline)
            }
        }

        InlineAddRow(onCapture = onCapture)
    }
}

// Swipe-to-dismiss (end-to-start) = remove to tray; disabled while a reorder drag is live so the
// two gestures can never fight.
@Composable
private fun DismissibleListRow(
    entry: DayListEntryView,
    isNow: Boolean,
    isDragging: Boolean,
    anyDragging: Boolean,
    isEnriching: Boolean,
    showPlay: Boolean,
    onTick: () -> Unit,
    onRemove: () -> Unit,
    onStartTimer: () -> Unit,
    onSomeday: () -> Unit,
    onLetGo: () -> Unit,
    onOpenTask: () -> Unit,
    onArchive: () -> Unit,
    onDragStart: () -> Unit,
    onDragBy: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onRemove()
                true
            } else {
                false
            }
        }
    )
    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = !anyDragging,
        backgroundContent = {
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(end = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = "Remove to tray",
                    tint = Ex3Colors.inkFaint
                )
            }
        }
    ) {
        ListRow(
            entry = entry,
            isNow = isNow,
            isDragging = isDragging,
            isEnriching = isEnriching,
            showPlay = showPlay,
            onTick = onTick,
            onStartTimer = onStartTimer,
            onSomeday = onSomeday,
            onLetGo = onLetGo,
            onOpenTask = onOpenTask,
            onArchive = onArchive,
            onDragStart = onDragStart,
            onDragBy = onDragBy,
            onDragEnd = onDragEnd,
            onDragCancel = onDragCancel
        )
    }
}

@Composable
private fun ListRow(
    entry: DayListEntryView,
    isNow: Boolean,
    isDragging: Boolean,
    isEnriching: Boolean,
    showPlay: Boolean,
    onTick: () -> Unit,
    onStartTimer: () -> Unit,
    onSomeday: () -> Unit,
    onLetGo: () -> Unit,
    onOpenTask: () -> Unit,
    onArchive: () -> Unit,
    onDragStart: () -> Unit,
    onDragBy: (Float) -> Unit,
    onDragEnd: () -> Unit,
    onDragCancel: () -> Unit
) {
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()

    // Completion ceremony: a brief settle pulse on the checkbox when the tick lands.
    val settleScale = remember { Animatable(1f) }
    LaunchedEffect(ticked) {
        if (ticked) {
            settleScale.snapTo(1.25f)
            settleScale.animateTo(1f, tween(260))
        }
    }

    Surface(
        color = if (isDragging) Ex3Colors.raised else Ex3Colors.bg,
        shadowElevation = if (isDragging) 6.dp else 0.dp,
        shape = RoundedCornerShape(if (isDragging) 8.dp else 0.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
        ) {
            // Hold zone = checkbox + title: press and hold anywhere here to complete (or untick).
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    // Hold feedback the thumb can't hide: a left-to-right warm sweep across the
                    // whole row plus a progress line along its bottom edge (user feedback: the
                    // checkbox ring sat exactly under the finger).
                    .drawBehind {
                        val p = hold.progress.value
                        if (p > 0f) {
                            drawRect(
                                color = Ex3Colors.accent.copy(alpha = 0.10f * p),
                                size = size.copy(width = size.width * p)
                            )
                            drawRect(
                                color = Ex3Colors.accent.copy(alpha = 0.85f),
                                topLeft = Offset(0f, size.height - 2.dp.toPx()),
                                size = androidx.compose.ui.geometry.Size(size.width * p, 2.dp.toPx())
                            )
                        }
                    }
                    .holdToComplete(hold, durationMs = 600, onComplete = onTick)
            ) {
                Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                    val progress = hold.progress.value
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .scale(settleScale.value * (1f + 0.15f * progress))
                            .clip(CircleShape)
                            .then(
                                if (ticked) Modifier.background(Ex3Colors.inkMuted)
                                else Modifier
                                    .border(
                                        width = if (isNow) 1.5.dp else 1.dp,
                                        color = if (isNow) Ex3Colors.accent else Ex3Colors.inkFaint,
                                        shape = CircleShape
                                    )
                                    .background(Ex3Colors.accent.copy(alpha = 0.25f * progress))
                            )
                            .drawBehind {
                                // The hold ring: fills clockwise as the press is held.
                                if (!ticked && progress > 0f) {
                                    drawArc(
                                        color = Ex3Colors.accent,
                                        startAngle = -90f,
                                        sweepAngle = 360f * progress,
                                        useCenter = false,
                                        style = Stroke(width = 2.dp.toPx())
                                    )
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        if (ticked) {
                            Icon(
                                imageVector = Icons.Filled.Check,
                                contentDescription = null,
                                tint = Ex3Colors.bg,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(vertical = 10.dp)
                ) {
                    Text(
                        text = entry.title,
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = if (isNow) FontWeight.Medium else FontWeight.Normal,
                            textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                        ),
                        color = if (ticked) Ex3Colors.inkFaint else Ex3Colors.ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    // T095 carry honesty: at 3+ carries the row offers someday / let go inline.
                    if (entry.carryNudge && !ticked) {
                        Spacer(Modifier.height(2.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Text(
                                text = "someday",
                                style = MaterialTheme.typography.labelMedium,
                                color = Ex3Colors.inkMuted,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable(onClick = onSomeday)
                                    .padding(vertical = 6.dp, horizontal = 2.dp)
                            )
                            Text(
                                text = "let go",
                                style = MaterialTheme.typography.labelMedium,
                                color = Ex3Colors.inkMuted,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable(onClick = onLetGo)
                                    .padding(vertical = 6.dp, horizontal = 2.dp)
                            )
                        }
                    }
                }
            }

            if (showPlay) {
                IconButton(onClick = onStartTimer) {
                    Icon(
                        imageVector = Icons.Filled.PlayArrow,
                        contentDescription = "Start timer",
                        tint = Ex3Colors.inkFaint,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Text(
                text = if (isEnriching) "filing..." else listRowMeta(entry),
                style = MaterialTheme.typography.labelMedium,
                color = if (entry.missedPin && !isEnriching) Ex3Colors.missed else Ex3Colors.inkFaint,
                maxLines = 1,
                modifier = Modifier.padding(start = 8.dp)
            )

            // The reorder grip, doing DOUBLE DUTY (ELEGANCE OVER CHROME — no new row buttons).
            // A handle inside a verticalScroll loses the vertical-gesture race unless it CLAIMS
            // the pointer on finger-down: consume the down and every subsequent change so the
            // scroll container (and swipe box) never see an unconsumed stream. Movement past a
            // ~10dp slop becomes the reorder drag exactly as before; releasing WITHOUT crossing
            // slop is a press — it opens the row's action menu (Edit / Log progress / Archive)
            // anchored right here at the grip.
            var menuOpen by remember { mutableStateOf(false) }
            Box(
                modifier = Modifier
                    .size(width = 44.dp, height = 48.dp)
                    .pointerInput(entry.taskId) {
                        val slop = 10.dp.toPx()
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = false)
                            down.consume()
                            var total = Offset.Zero
                            var dragging = false
                            try {
                                while (true) {
                                    val event = awaitPointerEvent()
                                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!change.pressed) {
                                        change.consume()
                                        break
                                    }
                                    val delta = change.positionChange()
                                    total += delta
                                    if (!dragging && (kotlin.math.abs(total.x) > slop || kotlin.math.abs(total.y) > slop)) {
                                        dragging = true
                                        onDragStart()
                                        if (total.y != 0f) onDragBy(total.y) // replay pre-slop travel
                                    } else if (dragging && delta.y != 0f) {
                                        onDragBy(delta.y)
                                    }
                                    change.consume()
                                }
                                if (dragging) onDragEnd() else menuOpen = true
                            } catch (t: Throwable) {
                                if (dragging) onDragCancel()
                                throw t
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Filled.DragIndicator,
                    contentDescription = "Reorder or open actions",
                    tint = Ex3Colors.inkFaint.copy(alpha = 0.55f),
                    modifier = Modifier.size(18.dp)
                )
                TaskRowMenu(
                    expanded = menuOpen,
                    onDismiss = { menuOpen = false },
                    onEdit = onOpenTask,
                    onLogProgress = onOpenTask, // v1: "Log progress" opens the sheet (progress row is right there)
                    onArchive = onArchive
                )
            }
        }
    }
}

private fun listRowMeta(entry: DayListEntryView): String {
    val carried = entry.carriedCount?.takeIf { it >= 1 }?.let { "↪ ${it}d · " } ?: ""
    // Logged progress shows as "Xm/Ym" in place of the bare estimate (unticked rows only).
    val effort = if (entry.progressMinutesToday > 0 && !entry.completedToday) {
        "${entry.progressMinutesToday}m/${entry.effortMinutes}m"
    } else {
        "${entry.effortMinutes}m"
    }
    val main = if (entry.pinnedTime != null) {
        // Pinned rows stay clean unless work is actually logged.
        if (entry.progressMinutesToday > 0 && !entry.completedToday) "${entry.pinnedTime} · $effort" else entry.pinnedTime
    } else {
        val folder = entry.folderPath?.substringAfterLast(" / ")
        // Skip the folder when the title already says it ("Meditation - 2hr sit" next to a
        // "Meditation" folder) - redundant meta is noise at a glance.
        if (folder != null && !entry.title.startsWith(folder, ignoreCase = true)) {
            "$folder · $effort"
        } else {
            effort
        }
    }
    return carried + main
}

// --- inline add ------------------------------------------------------------------------------------

@Composable
private fun InlineAddRow(onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
    ) {
        // Aligns with the checkbox column above: a quiet plus-shaped hint, not a button.
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            Text(text = "+", style = MaterialTheme.typography.bodyLarge, color = Ex3Colors.inkFaint)
        }
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ex3Colors.ink),
            cursorBrush = SolidColor(Ex3Colors.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                val text = draft.trim()
                draft = "" // clears immediately; enrichment runs async (T105)
                if (text.isNotEmpty()) {
                    onCapture(text) // keep focus: rapid batch entry
                } else {
                    focusManager.clearFocus() // empty done = put the cursor away (user feedback)
                }
            }),
            decorationBox = { innerTextField ->
                Box {
                    if (draft.isEmpty()) {
                        Text(
                            text = "type to add",
                            style = MaterialTheme.typography.bodyLarge,
                            color = Ex3Colors.inkFaint
                        )
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 14.dp)
        )
    }
}

// --- timer bar -------------------------------------------------------------------------------------

// The wire clock is "local time written as UTC" (stateTimestamp); compare against the device's
// local time encoded the same way so elapsed math stays consistent with the engine's.
private fun wireNowMillis(): Long = LocalDateTime.now().toInstant(ZoneOffset.UTC).toEpochMilli()

@Composable
internal fun TimerBar(
    timer: ActiveTimer,
    title: String,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: (Boolean) -> Unit
) {
    var nowMillis by remember { mutableLongStateOf(wireNowMillis()) }
    LaunchedEffect(timer) {
        while (true) {
            nowMillis = wireNowMillis()
            delay(1_000)
        }
    }
    val runningSeconds = timer.startedAt?.let { started ->
        ((nowMillis - runCatching { Instant.parse(started).toEpochMilli() }.getOrDefault(nowMillis)) / 1000)
            .coerceAtLeast(0)
    } ?: 0L
    val totalSeconds = timer.accumulatedMinutes * 60L + runningSeconds
    val paused = timer.startedAt == null

    var stopDialogOpen by remember { mutableStateOf(false) }

    Surface(color = Ex3Colors.raised) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 8.dp)
                .heightIn(min = 48.dp)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = "%d:%02d".format(totalSeconds / 60, totalSeconds % 60) + if (paused) " · paused" else "",
                style = MaterialTheme.typography.labelMedium,
                color = if (paused) Ex3Colors.inkMuted else Ex3Colors.accent
            )
            IconButton(onClick = if (paused) onResume else onPause) {
                Icon(
                    imageVector = if (paused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                    contentDescription = if (paused) "Resume timer" else "Pause timer",
                    tint = Ex3Colors.inkMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
            IconButton(onClick = { stopDialogOpen = true }) {
                Icon(
                    imageVector = Icons.Filled.Stop,
                    contentDescription = "Stop timer",
                    tint = Ex3Colors.inkMuted,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }

    if (stopDialogOpen) {
        AlertDialog(
            onDismissRequest = { stopDialogOpen = false },
            containerColor = Ex3Colors.surface,
            title = { Text("Done?", style = MaterialTheme.typography.titleMedium, color = Ex3Colors.ink) },
            text = {
                Text(
                    text = "Complete \"$title\", or just stop the timer?",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ex3Colors.inkMuted
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    stopDialogOpen = false
                    onStop(true)
                }) { Text("Complete", color = Ex3Colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = {
                    stopDialogOpen = false
                    onStop(false)
                }) { Text("Just stop", color = Ex3Colors.inkMuted) }
            }
        )
    }
}
