@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.twolaugh.ex3cuusion.core.domain.DayListPillarShare
import com.twolaugh.ex3cuusion.ui.today.TaskRowMenu

// T109: the list-reorder gesture, extracted VERBATIM (math and ordering rules) from
// DayListSection so every layout variant reuses one debugged implementation instead of
// re-breaking it per skin. Invariants carried over:
//   1. Rows always render in the COMMITTED order — reordering the composition mid-drag
//      recreates the dragged row's node and cancels its gesture coroutine. The pending order is
//      shown purely with translation offsets; the real reorder commits on release.
//   2. ONE position-based pending-order calculation drives both the visual shifts and the final
//      commit, so what you see mid-drag is exactly what lands.
//   3. The grip handle CLAIMS the pointer on finger-down (consume the down and every change) so
//      the scroll container and the swipe box never see an unconsumed stream.

@Stable
class VariantDragState internal constructor() {
    var draggedId by mutableStateOf<String?>(null)
        private set
    private var dragTotal by mutableFloatStateOf(0f)
    var pendingOrder by mutableStateOf<List<String>?>(null)
        private set
    internal val rowHeights = mutableStateMapOf<String, Int>()

    // Refreshed every composition by rememberVariantDragState.
    internal var committedIds: List<String> = emptyList()
    internal var onCommit: (List<String>) -> Unit = {}

    val anyDragging: Boolean get() = draggedId != null
    fun isDragging(id: String): Boolean = draggedId == id

    // The translationY a row should render with right now: the dragged row follows the finger;
    // any row displaced in the pending order slides by the dragged row's height.
    fun translationFor(id: String): Float {
        if (isDragging(id)) return dragTotal
        val pending = pendingOrder ?: return 0f
        val from = committedIds.indexOf(id)
        val to = pending.indexOf(id)
        return if (from >= 0 && to >= 0 && from != to) {
            (if (to > from) 1 else -1) * (rowHeights[draggedId] ?: 0).toFloat()
        } else 0f
    }

    internal fun startDrag(id: String) {
        draggedId = id
        dragTotal = 0f
        pendingOrder = committedIds
    }

    // Position-based pending order (copied from DayListSection.moveDraggedRow): the dragged row's
    // center (committed offset + finger travel) picks its insertion slot among the other rows'
    // committed extents.
    internal fun dragBy(amountY: Float) {
        val id = draggedId ?: return
        dragTotal += amountY
        val taskIds = committedIds
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
        pendingOrder = without.toMutableList().apply { add(insertPos, id) }
    }

    internal fun endDrag(cancelled: Boolean) {
        val finalOrder = pendingOrder
        draggedId = null
        dragTotal = 0f
        pendingOrder = null
        if (!cancelled && finalOrder != null && finalOrder != committedIds) onCommit(finalOrder)
    }
}

@Composable
fun rememberVariantDragState(
    committedIds: List<String>,
    onCommit: (List<String>) -> Unit
): VariantDragState {
    val state = remember { VariantDragState() }
    state.committedIds = committedIds
    state.onCommit = onCommit
    return state
}

// Per-row plumbing: height measurement + z-lift + the live translation. Apply to the Box that
// wraps each (committed-order) row.
fun Modifier.variantDragRow(state: VariantDragState, id: String): Modifier = this
    .onSizeChanged { state.rowHeights[id] = it.height }
    .zIndex(if (state.isDragging(id)) 1f else 0f)
    .graphicsLayer { translationY = state.translationFor(id) }

// The grip-handle gesture (copied from DayListSection's reorder grip): consumes the whole
// pointer stream on finger-down so it never loses the race against the scroll container or a
// swipe box. The grip does DOUBLE DUTY (ELEGANCE OVER CHROME): movement past a small slop
// becomes the reorder drag exactly as before; a release WITHOUT crossing slop is a press, and
// fires `onPress` (the row's action menu) instead of a dead no-op tap.
fun Modifier.variantDragHandle(
    state: VariantDragState,
    id: String,
    onPress: (() -> Unit)? = null
): Modifier =
    pointerInput(id) {
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
                        state.startDrag(id)
                        if (total.y != 0f) state.dragBy(total.y) // replay the pre-slop travel
                    } else if (dragging && delta.y != 0f) {
                        state.dragBy(delta.y)
                    }
                    change.consume()
                }
                if (dragging) state.endDrag(cancelled = false) else onPress?.invoke()
            } catch (t: Throwable) {
                if (dragging) state.endDrag(cancelled = true)
                throw t
            }
        }
    }

// A grip handle WITH the press menu: the shared composition every variant row uses — the drag
// gesture above plus the skin-toned TaskRowMenu anchored at the grip. Glyph styling stays the
// variant's own.
@Composable
fun VariantGripHandle(
    state: VariantDragState,
    id: String,
    onEdit: () -> Unit,
    onLogProgress: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    glyph: @Composable () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Box(
        modifier.variantDragHandle(state, id, onPress = { menuOpen = true }),
        contentAlignment = Alignment.Center
    ) {
        glyph()
        TaskRowMenu(
            expanded = menuOpen,
            onDismiss = { menuOpen = false },
            onEdit = onEdit,
            onLogProgress = onLogProgress,
            onArchive = onArchive,
            onDelete = onDelete
        )
    }
}

// The habits edit-state cue: a faint dashed outline drawn around an element while the strip's
// trailing "..." has armed editing.
fun Modifier.habitEditOutline(color: Color, cornerRadius: Dp = 8.dp): Modifier = drawBehind {
    drawRoundRect(
        color = color,
        style = Stroke(
            width = 1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))
        ),
        cornerRadius = CornerRadius(cornerRadius.toPx())
    )
}

// Swipe-to-dismiss (end-to-start) = remove to tray; disabled while a reorder drag is live so the
// two gestures can never fight (same rule as DayListSection's DismissibleListRow).
@Composable
fun VariantDismissibleRow(
    anyDragging: Boolean,
    onRemove: () -> Unit,
    dismissHint: Color,
    dismissHintStyle: TextStyle,
    content: @Composable () -> Unit
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
                Text(text = "×", style = dismissHintStyle, color = dismissHint)
            }
        }
    ) {
        content()
    }
}

// --- shared variant utilities ----------------------------------------------------------------

// Stable pillar index for a task row: its top-ancestor pillar's position in gauges.balance
// (which is sorted by minutes desc — the same order the mockups list categories in). Every list
// or habit task's pillar is present in balance by construction (the gauge mix is derived from
// exactly those tasks); -1 only for unfiled/unknown, which callers map to a neutral tone.
fun pillarIndexFor(folderPath: String?, balance: List<DayListPillarShare>): Int {
    val root = folderPath?.substringBefore(" / ") ?: return -1
    return balance.indexOfFirst { it.name == root }
}

fun pillarNameFor(folderPath: String?): String? = folderPath?.substringBefore(" / ")

// Day-shape: stable tone index for a pillar FOLDER ID. Pillars with actual minutes keep the
// position they already hold in gauges.balance (so an intent mark and its actual fill share a
// tone); pillars that only exist as intent today get the slots after the balance ones, in
// deviation order — every pillar gets a distinct, render-stable tone either way.
fun dayShapeToneIndex(
    folderId: String,
    deviations: List<com.twolaugh.ex3cuusion.core.domain.DayShapeDeviation>,
    balance: List<DayListPillarShare>
): Int {
    val inBalance = balance.indexOfFirst { it.folderId == folderId }
    if (inBalance >= 0) return inBalance
    val intentOnly = deviations.filter { d -> balance.none { it.folderId == d.folderId } }
    val slot = intentOnly.indexOfFirst { it.folderId == folderId }
    return if (slot >= 0) balance.size + slot else -1
}

// The folder leaf used as a row tag ("Meditation", "Kickboxing"...).
fun folderLeaf(folderPath: String?): String? = folderPath?.substringAfterLast(" / ")

// "3:55"-style clock figure (flightdeck dial, stat boxes).
fun formatClock(minutes: Int): String = "%d:%02d".format(minutes / 60, minutes % 60)

// "3H55"-style compressed figure (bauhaus stack caption).
fun formatBlockCaption(minutes: Int): String = "%dH%02d".format(minutes / 60, minutes % 60)

// Compact habit display name — same trimming rules as TodayScreen.habitShortName (private
// there, so re-stated): everything before the first long-form separator, hard-capped at ~30
// chars (chips now allow two lines before truncation; the sheet shows the full name).
fun habitShort(title: String): String {
    var cut = title.split(" — ", " - ", " – ").first().trim()
    if (cut.length > 30) cut = cut.split(" + ").first().trim()
    return if (cut.length > 30) cut.take(29).trimEnd() + "…" else cut
}

// Hold-to-complete feedback, flightdeck style: a border SWEEP that traces the row's perimeter
// clockwise from the top-left as the hold progresses (top → right → bottom → left).
fun DrawScope.drawBorderSweep(progress: Float, color: Color, strokeWidthPx: Float) {
    if (progress <= 0f) return
    val w = size.width
    val h = size.height
    val perimeter = 2 * (w + h)
    var remaining = perimeter * progress.coerceIn(0f, 1f)
    val half = strokeWidthPx / 2f
    // top edge, left → right
    val top = minOf(remaining, w)
    if (top > 0f) drawLine(color, androidx.compose.ui.geometry.Offset(0f, half), androidx.compose.ui.geometry.Offset(top, half), strokeWidthPx)
    remaining -= w
    if (remaining <= 0f) return
    // right edge, top → bottom
    val right = minOf(remaining, h)
    drawLine(color, androidx.compose.ui.geometry.Offset(w - half, 0f), androidx.compose.ui.geometry.Offset(w - half, right), strokeWidthPx)
    remaining -= h
    if (remaining <= 0f) return
    // bottom edge, right → left
    val bottom = minOf(remaining, w)
    drawLine(color, androidx.compose.ui.geometry.Offset(w, h - half), androidx.compose.ui.geometry.Offset(w - bottom, h - half), strokeWidthPx)
    remaining -= w
    if (remaining <= 0f) return
    // left edge, bottom → top
    val left = minOf(remaining, h)
    drawLine(color, androidx.compose.ui.geometry.Offset(half, h), androidx.compose.ui.geometry.Offset(half, h - left), strokeWidthPx)
}
