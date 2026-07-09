package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.DayListEntryView
import com.twolaugh.ex3cuusion.core.domain.DayListHabitView
import com.twolaugh.ex3cuusion.core.domain.DayShapeIntent
import com.twolaugh.ex3cuusion.core.domain.DayShapeSeverity
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.today.UiState
import com.twolaugh.ex3cuusion.ui.today.formatDuration
import com.twolaugh.ex3cuusion.ui.today.holdToComplete
import com.twolaugh.ex3cuusion.ui.today.rememberHoldToComplete
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

// T109 d4 FIELDNOTES — typewriter on field paper, red handwriting in the margins. Date headline
// with a handwritten done-count, hatched hand-drawn capacity bar with an open-time note, THE
// LIST with squared checkboxes + red annotations on the active row, HABITS as circular rubber
// STAMPS that ink in as the hold runs, and the tray as a casual one-line note. All data from
// ui.view; all writes through VariantActions; tokens from LocalSkin (intended: FieldnotesSkin).

private val FN_DATE = DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.UK)

private fun fnType(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = skin.type.body, // Special Elite
    fontSize = size,
    fontWeight = weight
)

private fun fnHand(skin: Ex3Skin, size: TextUnit) = TextStyle(
    fontFamily = skin.type.display, // Caveat
    fontSize = size,
    fontWeight = FontWeight.SemiBold
)

// Typewriter section header with the solid underline rule.
@Composable
private fun FnSectionHead(skin: Ex3Skin, left: String, right: (@Composable () -> Unit)? = null) {
    Row(
        verticalAlignment = Alignment.Bottom,
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRect(skin.palette.ink, topLeft = Offset(0f, size.height - 1.5.dp.toPx()), size = Size(size.width, 1.5.dp.toPx()))
            }
            .padding(bottom = 3.dp)
    ) {
        Text(left, style = fnType(skin, 13.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
        right?.invoke()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FieldnotesTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val red = skin.palette.accent
    val doneCount = view.entries.count { it.completedToday }
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()

    // Horizontal gutter comes in via `modifier` from VariantTodayBody (TodayVariant.bodyGutter).
    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(8.dp))

        // header: typewriter date + handwritten tilted done-count
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                (parsedDate?.format(FN_DATE) ?: view.date) + ".",
                style = fnType(skin, 22.sp), color = skin.palette.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                if (doneCount == 0) "0 done — yet!" else "$doneCount done!",
                style = fnHand(skin, 20.sp), color = red,
                modifier = Modifier.graphicsLayer { rotationZ = -3f }
            )
        }

        // capacity: hatched hand bar + the open-time note
        Spacer(Modifier.height(6.dp))
        val gauges = view.gauges
        Column(Modifier.clickable(onClick = actions::openBalance)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Text("capacity —", style = fnType(skin, 13.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
                Text(
                    "${formatDuration(gauges.listMinutes)} of ${formatDuration(gauges.capacityMinutes)}",
                    style = fnHand(skin, 19.sp), color = skin.palette.ink
                )
            }
            FnCapacityBar(
                skin = skin,
                listMinutes = gauges.listMinutes,
                capacityMinutes = gauges.capacityMinutes,
                intents = gauges.intentShares
            )
            val openMinutes = gauges.capacityMinutes - gauges.listMinutes
            Text(
                if (openMinutes >= 0) "↑ leave room to breathe (${formatDuration(openMinutes)})"
                else "over by ${formatDuration(-openMinutes)} — trim it!",
                style = fnHand(skin, 16.sp),
                color = if (openMinutes >= 0) skin.palette.inkMuted else red,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth()
            )
        }

        // THE LIST.
        Spacer(Modifier.height(4.dp))
        FnSectionHead(skin, "THE LIST.")
        Spacer(Modifier.height(5.dp))
        if (view.entries.isEmpty()) {
            Text(
                "nothing written down yet — check the tray, or type below…",
                style = fnType(skin, 13.sp), color = skin.palette.inkMuted,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }
        val drag = rememberVariantDragState(view.entries.map { it.taskId }, actions::reorder)
        val firstUntickedId = view.entries.firstOrNull { !it.completedToday }?.taskId
        view.entries.forEachIndexed { index, entry ->
            Box(Modifier.fillMaxWidth().variantDragRow(drag, entry.taskId)) {
                VariantDismissibleRow(
                    anyDragging = drag.anyDragging,
                    onRemove = { actions.removeFromList(entry.taskId) },
                    dismissHint = skin.palette.inkMuted,
                    dismissHintStyle = fnType(skin, 16.sp)
                ) {
                    FnListRow(
                        entry = entry,
                        rowIndex = index,
                        skin = skin,
                        isTimerActive = ui.activeTimer?.taskId == entry.taskId,
                        showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                        isEnriching = entry.taskId in ui.enrichingTaskIds,
                        actions = actions,
                        drag = drag
                    )
                }
            }
        }
        FnInlineAdd(skin = skin, onCapture = actions::instantCapture)

        // HABITS — stamps. The "···" in the header arms the edit state: stamps go dashed and a
        // tap opens the TaskSheet.
        if (view.habits.isNotEmpty()) {
            var habitsEditing by remember { mutableStateOf(false) }
            val ticked = view.habits.count { it.completedToday }
            Spacer(Modifier.height(10.dp))
            FnSectionHead(skin, "HABITS — stamp when done.") {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("$ticked / ${view.habits.size}", style = fnHand(skin, 16.sp), color = skin.palette.inkMuted)
                    Text(
                        "···",
                        style = fnType(skin, 13.sp),
                        color = if (habitsEditing) red else skin.palette.inkMuted,
                        modifier = Modifier.clickable { habitsEditing = !habitsEditing }.padding(start = 8.dp)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                view.habits.forEachIndexed { i, habit ->
                    FnStamp(
                        habit = habit, index = i, skin = skin, editing = habitsEditing,
                        onTick = { actions.tick(habit.taskId) }, onOpen = { actions.openTask(habit.taskId) }
                    )
                }
            }
        }

        // tray: a casual one-line note, expandable
        Spacer(Modifier.height(14.dp))
        FnTrayNote(ui = ui, skin = skin, actions = actions)
        Spacer(Modifier.height(16.dp))
    }
}

// Hand-drawn capacity bar: ink outline, red hatch strokes to the planned fraction, a dashed
// ink day-mark at the fill edge. Day-shape: small red intent MARKS — short pen ticks proud of
// the top edge at the cumulative pillar-share boundaries (where the day meant to change gears).
@Composable
private fun FnCapacityBar(
    skin: Ex3Skin,
    listMinutes: Int,
    capacityMinutes: Int,
    intents: List<DayShapeIntent> = emptyList()
) {
    val frac = when {
        capacityMinutes > 0 -> (listMinutes.toFloat() / capacityMinutes).coerceIn(0f, 1f)
        listMinutes > 0 -> 1f
        else -> 0f
    }
    Canvas(Modifier.fillMaxWidth().height(26.dp).padding(vertical = 2.dp)) {
        val inset = 1.dp.toPx()
        // the red intent marks (last boundary = the bar end; the outline already marks it)
        var cumulative = 0.0
        for (intent in intents.dropLast(1)) {
            cumulative += intent.share
            val tx = inset + (size.width - 2 * inset) * cumulative.toFloat()
            drawLine(
                skin.palette.accent,
                start = Offset(tx + 1.dp.toPx(), -1.dp.toPx()),
                end = Offset(tx - 1.dp.toPx(), 6.dp.toPx()),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round
            )
        }
        // the box, drawn slightly heavy like a pen pass
        drawRect(
            skin.palette.ink,
            topLeft = Offset(inset, inset),
            size = Size(size.width - 2 * inset, size.height - 2 * inset),
            style = Stroke(1.6.dp.toPx())
        )
        // red hatch strokes filling to the planned fraction
        val fillW = (size.width - 4 * inset) * frac
        clipRect(2 * inset, 2 * inset, 2 * inset + fillW, size.height - 2 * inset) {
            val step = 9.dp.toPx()
            var x = 2 * inset
            var alt = false
            while (x < 2 * inset + fillW + size.height) {
                drawLine(
                    skin.palette.accent.copy(alpha = 0.8f),
                    start = Offset(x, if (alt) 2 * inset else 3 * inset),
                    end = Offset(x - 5.dp.toPx(), size.height - (if (alt) 3 * inset else 2 * inset)),
                    strokeWidth = 2.2.dp.toPx(),
                    cap = StrokeCap.Round
                )
                x += step
                alt = !alt
            }
        }
        // dashed day-mark at the fill edge
        drawLine(
            skin.palette.ink,
            start = Offset(2 * inset + fillW, 0f),
            end = Offset(2 * inset + fillW - 2.dp.toPx(), size.height),
            strokeWidth = 2.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))
        )
    }
}

// One list entry: jittered square checkbox (red ink rises on hold; red X when done), typewriter
// title with a handwritten "← doing this now" on the live row, red handwritten duration.
@Composable
private fun FnListRow(
    entry: DayListEntryView,
    rowIndex: Int,
    skin: Ex3Skin,
    isTimerActive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val red = skin.palette.accent
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().drawBehind { drawRect(skin.palette.bg) } // opaque under swipe reveal
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(vertical = 5.dp)
        ) {
            // the checkbox, rotated a touch per row like a hand-ruled form
            Canvas(
                Modifier
                    .padding(top = 2.dp)
                    .size(13.dp)
                    .graphicsLayer { rotationZ = ((rowIndex * 7) % 5 - 2).toFloat() }
            ) {
                drawRect(skin.palette.ink.copy(alpha = 0.85f), style = Stroke(1.8.dp.toPx()))
                val p = if (ticked) 0f else hold.progress.value
                if (p > 0f) {
                    // red ink rises from the bottom as the hold runs
                    val h = size.height * p
                    drawRect(red.copy(alpha = 0.6f), topLeft = Offset(0f, size.height - h), size = Size(size.width, h))
                }
                if (ticked) {
                    // the done X, two quick pen strokes
                    drawLine(red, Offset(1.5.dp.toPx(), 2.dp.toPx()), Offset(size.width - 1.dp.toPx(), size.height - 2.dp.toPx()), 2.2.dp.toPx(), StrokeCap.Round)
                    drawLine(red, Offset(size.width - 1.5.dp.toPx(), 1.5.dp.toPx()), Offset(1.dp.toPx(), size.height - 1.5.dp.toPx()), 2.2.dp.toPx(), StrokeCap.Round)
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        entry.title,
                        style = fnType(skin, 14.5.sp).copy(
                            textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                        ),
                        color = if (ticked) skin.palette.inkMuted else skin.palette.ink,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isTimerActive) {
                        Spacer(Modifier.width(8.dp))
                        Text("← doing this now", style = fnHand(skin, 17.sp), color = red, maxLines = 1)
                    } else if (showPlay) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "start →", style = fnHand(skin, 16.sp), color = red,
                            modifier = Modifier.clickable { actions.startTimer(entry.taskId) }.padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                }
                val meta = fnRowMeta(entry, isEnriching)
                if (meta != null) {
                    Text(
                        meta,
                        style = fnType(skin, 10.5.sp).copy(letterSpacing = 0.5.sp),
                        color = if (entry.missedPin && !isEnriching) skin.palette.missed else skin.palette.inkMuted,
                        maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                }
                if (entry.carryNudge && !ticked) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            "to someday", style = fnHand(skin, 16.sp), color = red,
                            modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 2.dp)
                        )
                        Text(
                            "let it go", style = fnHand(skin, 16.sp), color = red,
                            modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 2.dp)
                        )
                    }
                }
            }
            // logged progress in the margin hand: "30/90m"
            val figure = if (entry.progressMinutesToday > 0 && !ticked) {
                "${entry.progressMinutesToday}/${entry.effortMinutes}m"
            } else {
                "${entry.effortMinutes}m"
            }
            Text(
                figure,
                style = fnHand(skin, 19.sp), color = if (ticked) skin.palette.inkMuted else red,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .graphicsLayer { rotationZ = -2f }
            )
        }
        // the reorder grip; a press without a drag opens the row's action menu
        VariantGripHandle(
            state = drag,
            id = entry.taskId,
            onEdit = { actions.openTask(entry.taskId) },
            onLogProgress = { actions.openTask(entry.taskId) },
            onArchive = { actions.archiveTask(entry.taskId) },
            onDelete = { actions.deleteTask(entry.taskId) },
            modifier = Modifier.size(width = 32.dp, height = 44.dp)
        ) {
            Text("⁞", style = fnType(skin, 16.sp), color = skin.palette.inkMuted)
        }
    }
}

private fun fnRowMeta(entry: DayListEntryView, isEnriching: Boolean): String? {
    if (isEnriching) return "FILING…"
    val parts = buildList {
        entry.pinnedTime?.let { add(it) }
        folderLeaf(entry.folderPath)?.let { add(it.uppercase(Locale.UK)) }
        entry.carriedCount?.takeIf { it >= 1 }?.let { add("CARRIED ${it}D") }
    }
    return parts.joinToString(" · ").ifEmpty { null }
}

// FOCUSED state (light-skin fix, 2026-06-12): the plain focused row over the IME read as a big
// blank cream box on paper. Focus now draws the TYPEWRITER LINE — a solid ink rule the next
// strike lands on — under the field, with the red cursor (accent cursorBrush) blinking on it.
// Same heightIn/padding in both states, so the focused row stays compact above the IME.
@Composable
private fun FnInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 42.dp)) {
        Text("+", style = fnType(skin, 13.sp), color = skin.palette.inkMuted, modifier = Modifier.width(23.dp))
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = fnType(skin, 14.sp).copy(color = skin.palette.ink),
            cursorBrush = SolidColor(skin.palette.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                val text = draft.trim()
                draft = "" // clears immediately; enrichment runs async (T105)
                if (text.isNotEmpty()) onCapture(text) else focusManager.clearFocus()
            }),
            decorationBox = { innerTextField ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        // constant bottom reserve keeps the typewriter line INSIDE the decoration
                        // bounds — drawn past them the field clips it and it never shows
                        .padding(bottom = 6.dp)
                        .drawBehind {
                            if (focused) {
                                // the typewriter line the next strike lands on
                                val y = size.height + 3.dp.toPx()
                                drawLine(
                                    skin.palette.ink.copy(alpha = 0.7f),
                                    start = Offset(0f, y),
                                    end = Offset(size.width, y),
                                    strokeWidth = 1.2.dp.toPx()
                                )
                            }
                        }
                ) {
                    if (draft.isEmpty()) {
                        Text("type to add… '6pm' pins it", style = fnType(skin, 13.sp), color = skin.palette.inkMuted)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 9.dp)
                .onFocusChanged { focused = it.isFocused }
        )
    }
}

// A circular rubber stamp: double ring, tilted, two abbreviated typewriter lines. The hold inks
// it in (red wash grows with progress); once ticked it stays stamped in red. Edit state: the
// outer ring goes DASHED and a tap opens the TaskSheet. Logged progress shows as a partial red
// arc rising around the ring.
@Composable
private fun FnStamp(
    habit: DayListHabitView,
    index: Int,
    skin: Ex3Skin,
    editing: Boolean,
    onTick: () -> Unit,
    onOpen: () -> Unit
) {
    val ticked = habit.completedToday
    val hold = rememberHoldToComplete()
    val red = skin.palette.accent
    val idle = skin.palette.inkMuted
    val rots = listOf(-4f, 3f, -2f, 5f, -5f, 2f, -3f, 4f, -2f, 3f, -4f)
    val (line1, line2) = fnStampLines(habit.title)
    Box(
        Modifier
            .size(54.dp)
            .graphicsLayer { rotationZ = rots[index % rots.size] }
            .drawBehind {
                val tone = if (ticked) red else idle
                val p = hold.progress.value
                if (ticked) {
                    drawCircle(red.copy(alpha = 0.12f))
                } else if (p > 0f) {
                    drawCircle(red.copy(alpha = 0.30f * p))
                }
                // double ring (the outer one dashes while editing)
                val outerStyle = if (editing) {
                    Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())))
                } else {
                    Stroke(1.5.dp.toPx())
                }
                drawCircle(tone, radius = size.minDimension / 2 - 1.dp.toPx(), style = outerStyle)
                drawCircle(tone, radius = size.minDimension / 2 - 4.dp.toPx(), style = Stroke(1.dp.toPx()))
                // partial progress: a red arc climbing the ring, proportional to logged/effort
                if (!ticked && habit.progressMinutesToday > 0 && habit.effortMinutes > 0) {
                    val frac = (habit.progressMinutesToday.toFloat() / habit.effortMinutes).coerceIn(0f, 1f)
                    drawArc(
                        red.copy(alpha = 0.8f),
                        startAngle = -90f,
                        sweepAngle = 360f * frac,
                        useCenter = false,
                        style = Stroke(2.dp.toPx(), cap = StrokeCap.Round)
                    )
                }
            }
            .then(
                if (editing) Modifier.clickable(onClick = onOpen)
                else Modifier.holdToComplete(hold, durationMs = 450, onComplete = onTick)
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                line1, style = fnType(skin, 8.5.sp).copy(letterSpacing = 0.5.sp),
                color = if (ticked) red else idle, maxLines = 1
            )
            if (line2.isNotEmpty()) {
                Text(
                    line2, style = fnType(skin, 7.5.sp),
                    color = if (ticked) red else idle, maxLines = 1
                )
            }
        }
    }
}

// Two short stamp lines from a habit title: first word over the rest, both hard-capped so the
// text sits inside the 54dp ring.
internal fun fnStampLines(title: String): Pair<String, String> {
    val words = habitShort(title).uppercase(Locale.UK).split(" ").filter { it.isNotBlank() }
    val first = words.firstOrNull()?.take(8) ?: "—"
    val rest = words.drop(1).joinToString(" ").take(9)
    return first to rest
}

// Number word for the tray note ("six loose notes").
private fun fnCountWord(n: Int): String = when (n) {
    1 -> "one"; 2 -> "two"; 3 -> "three"; 4 -> "four"; 5 -> "five"
    6 -> "six"; 7 -> "seven"; 8 -> "eight"; 9 -> "nine"
    else -> "$n"
}

@Composable
private fun FnTrayNote(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .graphicsLayer { rotationZ = -0.5f }
            .drawBehind {
                drawRect(
                    skin.palette.inkMuted,
                    style = Stroke(
                        width = 1.5.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))
                    )
                )
            }
            .clickable { expanded = !expanded }
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text(
                "TRAY — ${fnCountWord(suggestions.size)} loose note${if (suggestions.size == 1) "" else "s"}",
                style = fnType(skin, 12.5.sp), color = skin.palette.ink, modifier = Modifier.weight(1f)
            )
            Text(
                if (expanded) "tuck away ↑" else "sort me later →",
                style = fnHand(skin, 18.sp), color = skin.palette.accent
            )
        }
        if (expanded) {
            Spacer(Modifier.height(4.dp))
            for (task in suggestions) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            task.title, style = fnType(skin, 13.sp), color = skin.palette.ink,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                        if (task.staleQuestion) {
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text(
                                    "someday?", style = fnHand(skin, 16.sp), color = skin.palette.accent,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                                )
                                Text(
                                    "keep it", style = fnHand(skin, 16.sp), color = skin.palette.inkMuted,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text("${task.effortMinutes}m", style = fnType(skin, 11.5.sp), color = skin.palette.inkMuted)
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "add ✓", style = fnHand(skin, 17.sp), color = skin.palette.accent,
                        modifier = Modifier.clickable { actions.addFromTray(task.taskId) }.padding(vertical = 3.dp, horizontal = 2.dp)
                    )
                }
            }
        }
    }
}

// ── BALANCE — the day, tallied ───────────────────────────────────────────────────────────────────

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FieldnotesBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val red = skin.palette.accent

    Column(modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
        Text("The day, tallied.", style = fnType(skin, 22.sp), color = skin.palette.ink)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("one mark ≈ 15 minutes", style = fnType(skin, 12.sp), color = skin.palette.inkMuted)
            Text(
                "· ${formatDuration(gauges.listMinutes)} of ${formatDuration(gauges.capacityMinutes)}",
                style = fnHand(skin, 18.sp), color = red
            )
        }

        Spacer(Modifier.height(14.dp))
        val deviationById = gauges.deviations.associateBy { it.folderId }
        gauges.balance.forEach { pillar ->
            val deviation = deviationById[pillar.folderId]
            Column(
                Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawLine(
                            skin.palette.inkMuted,
                            start = Offset(0f, size.height - 0.5.dp.toPx()),
                            end = Offset(size.width, size.height - 0.5.dp.toPx()),
                            strokeWidth = 1.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.5.dp.toPx(), 3.dp.toPx()))
                        )
                    }
                    .padding(bottom = 10.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Text(
                        pillar.name.lowercase(Locale.UK),
                        style = fnType(skin, 15.sp), color = skin.palette.ink, modifier = Modifier.weight(1f)
                    )
                    Text(formatDuration(pillar.minutes) + " ", style = fnHand(skin, 19.sp), color = skin.palette.ink)
                    // day-shape: what the day MEANT for this pillar, in the margin hand — red
                    // only when the loose tolerance is actually broken
                    if (deviation != null) {
                        Text(
                            "(meant ~${formatDuration(deviation.intentMinutes)}) ",
                            style = fnHand(skin, 16.sp),
                            color = if (deviation.severity != DayShapeSeverity.None) red else skin.palette.inkMuted
                        )
                    }
                    Text("(${(pillar.share * 100).toInt()}%)", style = fnHand(skin, 16.sp), color = skin.palette.inkMuted)
                }
                Spacer(Modifier.height(4.dp))
                FnTally(count = max(1, (pillar.minutes / 15f).roundToInt()), skin = skin)
            }
            Spacer(Modifier.height(8.dp))
        }

        if (gauges.missingPillars.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer { rotationZ = -1.5f }
            ) {
                Text(
                    "nothing today from: ${gauges.missingPillars.joinToString(", ")}!",
                    style = fnHand(skin, 21.sp), color = red,
                    modifier = Modifier.drawBehind {
                        drawLine(red, Offset(0f, size.height), Offset(size.width, size.height), 2.dp.toPx())
                    }
                )
                Spacer(Modifier.height(6.dp))
                Text("— circle back when planning tomorrow —", style = fnType(skin, 11.5.sp), color = skin.palette.inkMuted)
            }
        }
        Spacer(Modifier.height(10.dp))
    }
}

// Red tally marks in groups of five (four strokes + the diagonal). One canvas per group keeps
// the geometry identical to the mockup's per-group SVGs.
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FnTally(count: Int, skin: Ex3Skin) {
    val red = skin.palette.accent.copy(alpha = 0.85f)
    val groups = buildList {
        var left = count
        while (left > 0) { add(minOf(5, left)); left -= 5 }
    }
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        for (g in groups) {
            val w = if (g == 5) 26 else g * 6 + 2
            Canvas(Modifier.size(width = w.dp, height = 22.dp)) {
                for (i in 0 until minOf(g, 4)) {
                    val jitter = (i % 2).toFloat()
                    drawLine(
                        red,
                        start = Offset((3 + i * 6).dp.toPx(), (2 + jitter).dp.toPx()),
                        end = Offset((2 + i * 6).dp.toPx(), (20 - jitter).dp.toPx()),
                        strokeWidth = 2.2.dp.toPx(),
                        cap = StrokeCap.Round
                    )
                }
                if (g == 5) {
                    drawLine(
                        red,
                        start = Offset((-2).dp.toPx(), 17.dp.toPx()),
                        end = Offset(24.dp.toPx(), 4.dp.toPx()),
                        strokeWidth = 2.2.dp.toPx(),
                        cap = StrokeCap.Round
                    )
                }
            }
        }
    }
}
