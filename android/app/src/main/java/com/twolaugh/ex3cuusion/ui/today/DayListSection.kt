package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
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
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
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

// Rows live in the screen's single scrollable column (not a LazyColumn), so reorder is a
// hand-rolled long-press drag: the pressed row elevates and translates with the finger, swapping
// places in a local order list whenever it crosses 60% of a neighbour's height; the engine's
// reorderDayList commits once, on drop.
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
    onCapture: (String) -> Unit
) {
    val taskIds = entries.map { it.taskId }
    val firstUntickedId = entries.firstOrNull { !it.completedToday }?.taskId

    var dragId by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableFloatStateOf(0f) }
    var dragOrder by remember { mutableStateOf<List<String>?>(null) }
    val rowHeights = remember { mutableStateMapOf<String, Int>() }

    val byId = entries.associateBy { it.taskId }
    val displayOrder = dragOrder?.filter { it in byId } ?: taskIds

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
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onSizeChanged { rowHeights[id] = it.height }
                        .zIndex(if (isDragging) 1f else 0f)
                        .graphicsLayer { translationY = if (isDragging) dragOffset else 0f }
                        .pointerInput(taskIds) {
                            detectDragGesturesAfterLongPress(
                                onDragStart = {
                                    dragId = id
                                    dragOffset = 0f
                                    dragOrder = taskIds
                                },
                                onDrag = { change, amount ->
                                    change.consume()
                                    dragOffset += amount.y
                                    val order = dragOrder ?: return@detectDragGesturesAfterLongPress
                                    val index = order.indexOf(id)
                                    if (index < 0) return@detectDragGesturesAfterLongPress
                                    if (dragOffset > 0f && index < order.lastIndex) {
                                        val belowId = order[index + 1]
                                        val belowHeight = rowHeights[belowId] ?: 0
                                        if (belowHeight > 0 && dragOffset > belowHeight * 0.6f) {
                                            dragOrder = order.toMutableList().apply {
                                                removeAt(index)
                                                add(index + 1, id)
                                            }
                                            dragOffset -= belowHeight
                                        }
                                    } else if (dragOffset < 0f && index > 0) {
                                        val aboveId = order[index - 1]
                                        val aboveHeight = rowHeights[aboveId] ?: 0
                                        if (aboveHeight > 0 && -dragOffset > aboveHeight * 0.6f) {
                                            dragOrder = order.toMutableList().apply {
                                                removeAt(index)
                                                add(index - 1, id)
                                            }
                                            dragOffset += aboveHeight
                                        }
                                    }
                                },
                                onDragEnd = {
                                    val finalOrder = dragOrder
                                    dragId = null
                                    dragOffset = 0f
                                    dragOrder = null
                                    if (finalOrder != null && finalOrder != taskIds) onReorder(finalOrder)
                                },
                                onDragCancel = {
                                    dragId = null
                                    dragOffset = 0f
                                    dragOrder = null
                                }
                            )
                        }
                ) {
                    DismissibleListRow(
                        entry = entry,
                        isNow = entry.taskId == firstUntickedId,
                        isDragging = isDragging,
                        isEnriching = entry.taskId in enrichingTaskIds,
                        showPlay = entry.taskId == firstUntickedId && !timerRunning,
                        onTick = { onTick(entry.taskId) },
                        onRemove = { onRemove(entry.taskId) },
                        onStartTimer = { onStartTimer(entry.taskId) },
                        onSomeday = { onSomeday(entry.taskId) },
                        onLetGo = { onLetGo(entry.taskId) }
                    )
                }
            }
        }

        InlineAddRow(onCapture = onCapture)
    }
}

// Swipe-to-dismiss (end-to-start) = remove to tray. The chosen removal affordance — there is no
// trailing remove icon.
@Composable
private fun DismissibleListRow(
    entry: DayListEntryView,
    isNow: Boolean,
    isDragging: Boolean,
    isEnriching: Boolean,
    showPlay: Boolean,
    onTick: () -> Unit,
    onRemove: () -> Unit,
    onStartTimer: () -> Unit,
    onSomeday: () -> Unit,
    onLetGo: () -> Unit
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
            onLetGo = onLetGo
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
    onLetGo: () -> Unit
) {
    val ticked = entry.completedToday
    Surface(
        color = if (isDragging) Ex3Colors.raised else Ex3Colors.bg,
        shadowElevation = if (isDragging) 6.dp else 0.dp,
        shape = RoundedCornerShape(if (isDragging) 10.dp else 0.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .padding(vertical = 2.dp)
        ) {
            // Round checkbox; the top unticked row gets the slim now-emphasis (accent border).
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onTick),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .then(
                            if (ticked) Modifier.background(Ex3Colors.inkMuted)
                            else Modifier.border(
                                width = if (isNow) 1.5.dp else 1.dp,
                                color = if (isNow) Ex3Colors.accent else Ex3Colors.inkFaint,
                                shape = CircleShape
                            )
                        ),
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
                modifier = Modifier.padding(start = 8.dp, end = 4.dp)
            )
        }
    }
}

private fun listRowMeta(entry: DayListEntryView): String {
    val carried = entry.carriedCount?.takeIf { it >= 1 }?.let { "↪ ${it}d · " } ?: ""
    val main = if (entry.pinnedTime != null) {
        entry.pinnedTime
    } else {
        val folder = entry.folderPath?.substringAfterLast(" / ")
        if (folder != null) "$folder · ${entry.effortMinutes}m" else "${entry.effortMinutes}m"
    }
    return carried + main
}

// --- inline add ------------------------------------------------------------------------------------

@Composable
private fun InlineAddRow(onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
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
                draft = "" // clears immediately; capture is local-only (AI enrichment = T105)
                if (text.isNotEmpty()) onCapture(text)
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
