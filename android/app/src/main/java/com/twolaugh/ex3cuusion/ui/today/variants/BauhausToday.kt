package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.DayListEntryView
import com.twolaugh.ex3cuusion.core.domain.DayListGauges
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
import kotlin.math.min

// T109 d6 BAUHAUS — Day-Builder. Display date block, a left PROPORTIONAL STACK column (tasks
// as duration-height bricks + a dashed OPEN box) beside THE LIST with pillar SHAPES
// (circle/square/triangle/diamond/arch/ring), habits as outline shapes that fill when ticked,
// black tray bar. All data from ui.view; all writes through VariantActions; tokens from
// LocalSkin (intended skin: BauhausSkin).

private val BH_DOW = DateTimeFormatter.ofPattern("EEE", Locale.UK)
private val BH_MONTH = DateTimeFormatter.ofPattern("MMMM", Locale.UK)

private fun bhDisplay(skin: Ex3Skin, size: TextUnit) = TextStyle(
    fontFamily = skin.type.display, fontSize = size, fontWeight = FontWeight.Black
)

private fun bhSans(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.SemiBold) = TextStyle(
    fontFamily = skin.type.body, fontSize = size, fontWeight = weight
)

private fun bhLabel(skin: Ex3Skin, size: TextUnit = 10.sp, weight: FontWeight = FontWeight.ExtraBold) = TextStyle(
    fontFamily = skin.type.body, fontSize = size, fontWeight = weight,
    letterSpacing = skin.type.labelLetterSpacing
)

// ── the six pillar shapes ────────────────────────────────────────────────────────────────────────
// circle / square / triangle / diamond / arch / ring, drawn on Canvas. fillProgress 0..1 fills
// the glyph (alpha rise inside a constant outline) — the bauhaus restyle of hold-to-complete.
@Composable
fun BauhausShapeGlyph(
    index: Int,
    tone: Color,
    glyphSize: Dp,
    fillProgress: Float,
    modifier: Modifier = Modifier
) {
    Canvas(modifier.size(glyphSize)) {
        val w = size.width
        val h = size.height
        val p = fillProgress.coerceIn(0f, 1f)
        val stroke = 2.5.dp.toPx()
        when (index.coerceAtLeast(0) % 6) {
            0 -> { // circle
                if (p > 0f) drawCircle(tone.copy(alpha = p), radius = w / 2 - stroke / 2)
                drawCircle(tone, radius = w / 2 - stroke / 2, style = Stroke(stroke))
            }
            1 -> { // square
                if (p > 0f) drawRect(tone.copy(alpha = p))
                drawRect(tone, topLeft = Offset(stroke / 2, stroke / 2), size = Size(w - stroke, h - stroke), style = Stroke(stroke))
            }
            2 -> { // triangle
                val path = Path().apply {
                    moveTo(w / 2, 1.dp.toPx())
                    lineTo(w - 1.dp.toPx(), h - 1.dp.toPx())
                    lineTo(1.dp.toPx(), h - 1.dp.toPx())
                    close()
                }
                if (p > 0f) drawPath(path, tone.copy(alpha = p))
                drawPath(path, tone, style = Stroke(2.dp.toPx()))
            }
            3 -> { // diamond
                val path = Path().apply {
                    moveTo(w / 2, 0.5.dp.toPx())
                    lineTo(w - 0.5.dp.toPx(), h / 2)
                    lineTo(w / 2, h - 0.5.dp.toPx())
                    lineTo(0.5.dp.toPx(), h / 2)
                    close()
                }
                if (p > 0f) drawPath(path, tone.copy(alpha = p))
                drawPath(path, tone, style = Stroke(1.8.dp.toPx()))
            }
            4 -> { // arch: semicircular top on a flat base
                val path = Path().apply {
                    moveTo(stroke / 2, h - stroke / 2)
                    lineTo(stroke / 2, h / 2)
                    arcTo(Rect(stroke / 2, stroke / 2, w - stroke / 2, h - stroke / 2), 180f, 180f, false)
                    lineTo(w - stroke / 2, h - stroke / 2)
                    close()
                }
                if (p > 0f) drawPath(path, tone.copy(alpha = p))
                drawPath(path, tone, style = Stroke(stroke))
            }
            else -> { // ring
                val ringStroke = 4.dp.toPx()
                if (p > 0f) drawCircle(tone.copy(alpha = p), radius = max(0f, w / 2 - ringStroke - 1.dp.toPx()))
                drawCircle(tone, radius = w / 2 - ringStroke / 2, style = Stroke(ringStroke))
            }
        }
    }
}

@Composable
fun BauhausTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val doneCount = view.entries.count { it.completedToday }
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()

    Column(modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
            Spacer(Modifier.height(6.dp))

            // header: THU / 11 display block + right-set month, count, missing-pillar tag
            Row(Modifier.fillMaxWidth()) {
                Text(
                    "${(parsedDate?.format(BH_DOW) ?: "—").uppercase(Locale.UK)}\n${parsedDate?.dayOfMonth ?: ""}",
                    style = bhDisplay(skin, 44.sp).copy(lineHeight = 41.sp, letterSpacing = (-0.5).sp),
                    color = skin.palette.ink,
                    modifier = Modifier.weight(1f)
                )
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(top = 4.dp)) {
                    Text(
                        (parsedDate?.format(BH_MONTH) ?: "").uppercase(Locale.UK),
                        style = bhDisplay(skin, 16.sp).copy(letterSpacing = 1.3.sp), color = skin.palette.ink
                    )
                    Text("your list · $doneCount done", style = bhSans(skin, 11.sp), color = skin.palette.inkMuted)
                    val missing = view.gauges.missingPillars.firstOrNull()
                    if (missing != null) {
                        Spacer(Modifier.height(5.dp))
                        Box(
                            Modifier
                                .background(skin.palette.accent)
                                .clickable(onClick = actions::openBalance)
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                "NO ${missing.uppercase(Locale.UK)} YET",
                                style = bhLabel(skin), color = skin.palette.onAccent
                            )
                        }
                    }
                }
            }

            // builder: proportional stack beside the list
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth()) {
                BhStack(
                    ui = ui,
                    skin = skin,
                    modifier = Modifier.width(106.dp).clickable(onClick = actions::openBalance)
                )
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("THE LIST", style = bhLabel(skin), color = skin.palette.inkMuted)
                    Spacer(Modifier.height(2.dp))
                    if (view.entries.isEmpty()) {
                        Text(
                            "nothing stacked — pull from the tray or type below",
                            style = bhSans(skin, 12.sp), color = skin.palette.inkMuted,
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
                                dismissHintStyle = bhDisplay(skin, 14.sp)
                            ) {
                                BhListRow(
                                    entry = entry,
                                    skin = skin,
                                    pillarIndex = pillarIndexFor(entry.folderPath, view.gauges.balance),
                                    isNow = entry.taskId == firstUntickedId,
                                    isTimerActive = ui.activeTimer?.taskId == entry.taskId,
                                    showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                                    isEnriching = entry.taskId in ui.enrichingTaskIds,
                                    showDivider = index < view.entries.size - 1,
                                    actions = actions,
                                    drag = drag
                                )
                            }
                        }
                    }
                    BhInlineAdd(skin = skin, onCapture = actions::instantCapture)
                }
            }

            // habits: outline shapes that fill when ticked. The "···" arms the edit state:
            // glyphs gain a dashed outline and a tap opens the TaskSheet.
            if (view.habits.isNotEmpty()) {
                var habitsEditing by remember { mutableStateOf(false) }
                val tickedHabits = view.habits.count { it.completedToday }
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().height(4.dp).background(skin.palette.ink))
                Spacer(Modifier.height(7.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Text("HABITS — FILL THE ROW", style = bhLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
                    Text("$tickedHabits/${view.habits.size}", style = bhDisplay(skin, 14.sp), color = skin.palette.ink)
                    Text(
                        "···",
                        style = bhDisplay(skin, 14.sp),
                        color = if (habitsEditing) skin.palette.accent else skin.palette.inkMuted,
                        modifier = Modifier.clickable { habitsEditing = !habitsEditing }.padding(start = 10.dp)
                    )
                }
                Spacer(Modifier.height(8.dp))
                FlowRowOfHabitShapes(
                    ui = ui, skin = skin, editing = habitsEditing,
                    onTick = actions::tick, onOpen = actions::openTask
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    view.habits.joinToString(" · ") { habitShort(it.title).lowercase(Locale.UK) },
                    style = bhSans(skin, 10.sp), color = skin.palette.inkMuted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.height(12.dp))
        }

        // black tray bar, full bleed
        BhTrayBar(ui = ui, skin = skin, actions = actions)
    }
}

// The day as a container: dashed OPEN headroom on top, then bricks (largest first), heights
// proportional to duration; a heavy baseline carries the planned/capacity caption.
@Composable
private fun BhStack(ui: UiState, skin: Ex3Skin, modifier: Modifier = Modifier) {
    val view = ui.view ?: return
    val gauges = view.gauges
    val capacity = max(1, max(gauges.capacityMinutes, gauges.listMinutes))
    val stackHeight = 320f // dp of column representing the full capacity
    val scale = stackHeight / capacity
    val openMinutes = max(0, gauges.capacityMinutes - gauges.listMinutes)
    val bricks = view.entries.sortedByDescending { it.effortMinutes }

    Column(modifier) {
        // open headroom: dashed box, no bottom edge
        Box(
            Modifier
                .fillMaxWidth()
                .height(max(30f, openMinutes * scale).dp)
                .drawBehind {
                    val sw = 3.dp.toPx()
                    val dash = PathEffect.dashPathEffect(floatArrayOf(7.dp.toPx(), 6.dp.toPx()))
                    val c = skin.palette.inkMuted
                    drawLine(c, Offset(0f, sw / 2), Offset(size.width, sw / 2), sw, pathEffect = dash)
                    drawLine(c, Offset(sw / 2, 0f), Offset(sw / 2, size.height), sw, pathEffect = dash)
                    drawLine(c, Offset(size.width - sw / 2, 0f), Offset(size.width - sw / 2, size.height), sw, pathEffect = dash)
                },
            contentAlignment = Alignment.Center
        ) {
            Text(
                "${formatDuration(openMinutes)}\nopen",
                style = bhSans(skin, 10.5.sp, FontWeight.Bold), color = skin.palette.inkMuted,
                textAlign = TextAlign.Center
            )
        }
        // bricks
        for (entry in bricks) {
            val tone = pillarIndexFor(entry.folderPath, gauges.balance).let { i ->
                if (i >= 0) skin.palette.pillarTones[i % skin.palette.pillarTones.size] else skin.palette.inkMuted
            }
            val ticked = entry.completedToday
            Spacer(Modifier.height(3.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(max(14f, entry.effortMinutes * scale - 3f).dp)
                    .background(if (ticked) tone.copy(alpha = 0.35f) else tone),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    "${entry.effortMinutes}m",
                    style = bhDisplay(skin, if (entry.effortMinutes >= 45) 22.sp else 13.sp),
                    color = skin.palette.onAccent
                )
                if (ui.activeTimer?.taskId == entry.taskId) {
                    Canvas(Modifier.align(Alignment.TopEnd).padding(5.dp).size(11.dp)) {
                        val path = Path().apply {
                            moveTo(0f, 0f)
                            lineTo(size.width, size.height / 2)
                            lineTo(0f, size.height)
                            close()
                        }
                        drawPath(path, skin.palette.bg)
                    }
                }
            }
        }
        // baseline + caption
        Spacer(Modifier.height(0.dp))
        Box(Modifier.fillMaxWidth().height(4.dp).background(skin.palette.ink))
        Spacer(Modifier.height(4.dp))
        Text(
            "${formatBlockCaption(gauges.listMinutes)} / ${formatBlockCaption(gauges.capacityMinutes)}",
            style = bhLabel(skin), color = skin.palette.ink,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
    }
}

// One list row: pillar shape glyph (the hold target — it floods as the hold runs, stays filled
// once ticked), bold title, compact meta line, reorder grip.
@Composable
private fun BhListRow(
    entry: DayListEntryView,
    skin: Ex3Skin,
    pillarIndex: Int,
    isNow: Boolean,
    isTimerActive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    showDivider: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val tone = if (pillarIndex >= 0) skin.palette.pillarTones[pillarIndex % skin.palette.pillarTones.size] else skin.palette.inkMuted
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(skin.palette.bg)
            .drawBehind {
                if (showDivider) {
                    drawRect(
                        skin.palette.inkFaint,
                        topLeft = Offset(0f, size.height - 2.dp.toPx()),
                        size = Size(size.width, 2.dp.toPx())
                    )
                }
            }
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(vertical = 6.dp)
        ) {
            BauhausShapeGlyph(
                index = pillarIndex,
                tone = tone,
                glyphSize = 15.dp,
                fillProgress = if (ticked) 1f else hold.progress.value
            )
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    entry.title,
                    style = bhSans(skin, 13.sp, FontWeight.Bold).copy(
                        textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                    ),
                    color = if (ticked) skin.palette.inkMuted else skin.palette.ink,
                    maxLines = 2, overflow = TextOverflow.Ellipsis
                )
                Text(
                    bhRowMeta(entry, isTimerActive, isEnriching),
                    style = bhSans(skin, 10.sp).copy(letterSpacing = 0.4.sp),
                    color = if (entry.missedPin && !isEnriching) skin.palette.missed else skin.palette.inkMuted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                if (entry.carryNudge && !ticked) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(
                            "SOMEDAY", style = bhLabel(skin, 9.sp), color = skin.palette.accent,
                            modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 3.dp)
                        )
                        Text(
                            "LET GO", style = bhLabel(skin, 9.sp), color = skin.palette.accent,
                            modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 3.dp)
                        )
                    }
                }
            }
        }
        if (showPlay) {
            Text(
                "▶",
                style = bhSans(skin, 12.sp, FontWeight.Bold), color = skin.palette.inkMuted,
                modifier = Modifier.clickable { actions.startTimer(entry.taskId) }.padding(6.dp)
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
            Text("≡", style = bhDisplay(skin, 13.sp), color = skin.palette.inkMuted)
        }
    }
}

private fun bhRowMeta(entry: DayListEntryView, isTimerActive: Boolean, isEnriching: Boolean): String {
    if (isEnriching) return "FILING…"
    // logged progress in the block caption voice: "30/90M"
    val figure = if (entry.progressMinutesToday > 0 && !entry.completedToday) {
        "${entry.progressMinutesToday}/${entry.effortMinutes}M"
    } else {
        "${entry.effortMinutes}M"
    }
    val parts = buildList {
        folderLeaf(entry.folderPath)?.let { add(it.uppercase(Locale.UK)) }
        add(entry.pinnedTime ?: figure)
        if (entry.pinnedTime != null && entry.progressMinutesToday > 0 && !entry.completedToday) add(figure)
        entry.carriedCount?.takeIf { it >= 1 }?.let { add("↪${it}D") }
        if (isTimerActive) add("NOW ▶")
    }
    return parts.joinToString(" · ")
}

// FOCUSED state (light-skin fix, 2026-06-12): the plain focused row over the IME read as a big
// blank box on the white ground. Focus now sets a BOLD UNDERLINE RULE — the bauhaus stroke —
// under the field, so the writing area reads as a deliberate element. Same heightIn/padding in
// both states; the focused row stays compact above the IME.
@Composable
private fun BhInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp)) {
        Text("＋", style = bhSans(skin, 12.sp), color = skin.palette.inkMuted)
        Spacer(Modifier.width(9.dp))
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = bhSans(skin, 12.5.sp).copy(color = skin.palette.ink),
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
                        // constant bottom reserve keeps the rule INSIDE the decoration bounds —
                        // drawn past them the field clips it and it never shows
                        .padding(bottom = 6.dp)
                        .drawBehind {
                            if (focused) {
                                // the bold rule the entry is set on
                                drawRect(
                                    skin.palette.ink,
                                    topLeft = Offset(0f, size.height + 2.dp.toPx()),
                                    size = Size(size.width, 3.dp.toPx())
                                )
                            }
                        }
                ) {
                    if (draft.isEmpty()) {
                        Text("type to add — 6pm pins", style = bhSans(skin, 12.sp), color = skin.palette.inkMuted)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 8.dp)
                .onFocusChanged { focused = it.isFocused }
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowOfHabitShapes(
    ui: UiState,
    skin: Ex3Skin,
    editing: Boolean,
    onTick: (String) -> Unit,
    onOpen: (String) -> Unit
) {
    val habits = ui.view?.habits ?: return
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        habits.forEachIndexed { i, habit ->
            val hold = rememberHoldToComplete()
            // Partial fill: logged progress / effort shows as a translucent part-fill of the
            // glyph (a held press still floods over it).
            val progressFill = if (!habit.completedToday && habit.effortMinutes > 0) {
                (habit.progressMinutesToday.toFloat() / habit.effortMinutes).coerceIn(0f, 0.6f)
            } else 0f
            BauhausShapeGlyph(
                index = i % 6,
                tone = skin.palette.pillarTones[i % skin.palette.pillarTones.size],
                glyphSize = 19.dp,
                fillProgress = if (habit.completedToday) 1f else maxOf(hold.progress.value, progressFill),
                modifier = Modifier
                    .padding(2.dp) // a touch of finger room around each glyph
                    .then(
                        if (editing) {
                            Modifier
                                .habitEditOutline(skin.palette.ink.copy(alpha = 0.5f), 2.dp)
                                .clickable { onOpen(habit.taskId) }
                        } else {
                            Modifier.holdToComplete(hold, durationMs = 450, onComplete = { onTick(habit.taskId) })
                        }
                    )
            )
        }
    }
}

@Composable
private fun BhTrayBar(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(skin.palette.ink)
                .clickable { expanded = !expanded }
                .padding(horizontal = 18.dp, vertical = 10.dp)
        ) {
            Text(
                "TRAY · ${suggestions.size} SUGGESTIONS",
                style = bhLabel(skin, 11.sp), color = skin.palette.bg, modifier = Modifier.weight(1f)
            )
            Text("＋", style = bhDisplay(skin, 20.sp), color = skin.palette.bg)
        }
        if (expanded) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp)) {
                for (task in suggestions) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                task.title, style = bhSans(skin, 12.5.sp, FontWeight.Bold), color = skin.palette.ink,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            if (task.staleQuestion) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(
                                        "SOMEDAY?", style = bhLabel(skin, 9.sp), color = skin.palette.accent,
                                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                                    )
                                    Text(
                                        "KEEP", style = bhLabel(skin, 9.sp), color = skin.palette.inkMuted,
                                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                                    )
                                }
                            }
                        }
                        Text("${task.effortMinutes}M", style = bhSans(skin, 10.sp), color = skin.palette.inkMuted)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "ADD", style = bhLabel(skin, 10.sp), color = skin.palette.accent,
                            modifier = Modifier.clickable { actions.addFromTray(task.taskId) }.padding(vertical = 4.dp, horizontal = 2.dp)
                        )
                    }
                }
            }
        }
    }
}

// ── BALANCE — THE STACK ──────────────────────────────────────────────────────────────────────────

@Composable
fun BauhausBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val capacity = max(1, max(gauges.capacityMinutes, gauges.listMinutes))
    val openMinutes = max(0, gauges.capacityMinutes - gauges.listMinutes)
    val barHeight = 380f
    val scale = barHeight / capacity

    Column(modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
            Spacer(Modifier.height(6.dp))
            Text("THE STACK", style = bhDisplay(skin, 34.sp), color = skin.palette.ink)
            Text(
                "${formatDuration(gauges.listMinutes)} planned of ${formatDuration(gauges.capacityMinutes)} capacity",
                style = bhSans(skin, 11.5.sp), color = skin.palette.inkMuted
            )
            Spacer(Modifier.height(12.dp))

            Row(Modifier.fillMaxWidth()) {
                // Day-shape: the INTENT column — dashed outline blocks (the same dashed voice as
                // OPEN) sized share × capacity, in the same pillar order as the built stack, so
                // meant-vs-built reads side by side.
                val orderedDeviations = gauges.balance.mapNotNull { p -> gauges.deviations.find { it.folderId == p.folderId } } +
                    gauges.deviations.filter { d -> gauges.balance.none { it.folderId == d.folderId } }
                if (orderedDeviations.isNotEmpty()) {
                    Column(Modifier.width(34.dp)) {
                        orderedDeviations.forEachIndexed { i, deviation ->
                            if (i > 0) Spacer(Modifier.height(2.dp))
                            val toneIdx = dayShapeToneIndex(deviation.folderId, gauges.deviations, gauges.balance)
                            val tone = if (toneIdx >= 0) skin.palette.pillarTones[toneIdx % skin.palette.pillarTones.size] else skin.palette.inkMuted
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(max(10f, deviation.intentMinutes * scale - 2f).dp)
                                    .drawBehind {
                                        drawRect(
                                            tone,
                                            style = Stroke(
                                                2.dp.toPx(),
                                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))
                                            )
                                        )
                                    }
                            )
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                }
                // 100%-of-capacity stacked bar
                Column(Modifier.width(92.dp)) {
                    if (openMinutes > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(max(20f, openMinutes * scale).dp)
                                .drawBehind {
                                    val sw = 3.dp.toPx()
                                    val dash = PathEffect.dashPathEffect(floatArrayOf(7.dp.toPx(), 6.dp.toPx()))
                                    val c = skin.palette.inkMuted
                                    drawLine(c, Offset(0f, sw / 2), Offset(size.width, sw / 2), sw, pathEffect = dash)
                                    drawLine(c, Offset(sw / 2, 0f), Offset(sw / 2, size.height), sw, pathEffect = dash)
                                    drawLine(c, Offset(size.width - sw / 2, 0f), Offset(size.width - sw / 2, size.height), sw, pathEffect = dash)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("OPEN", style = bhSans(skin, 10.sp, FontWeight.Bold), color = skin.palette.inkMuted)
                        }
                    }
                    gauges.balance.forEachIndexed { i, pillar ->
                        Spacer(Modifier.height(2.dp))
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(max(14f, pillar.minutes * scale - 2f).dp)
                                .background(skin.palette.pillarTones[i % skin.palette.pillarTones.size]),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "${(pillar.share * 100).toInt()}%",
                                style = bhDisplay(skin, if (pillar.minutes > 40) 17.sp else 11.sp),
                                color = skin.palette.onAccent
                            )
                        }
                    }
                }
                Spacer(Modifier.width(16.dp))
                // shape legend
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                    gauges.balance.forEachIndexed { i, pillar ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            BauhausShapeGlyph(
                                index = i,
                                tone = skin.palette.pillarTones[i % skin.palette.pillarTones.size],
                                glyphSize = 16.dp,
                                fillProgress = 1f
                            )
                            Column {
                                Text(
                                    pillar.name.uppercase(Locale.UK),
                                    style = bhLabel(skin, 14.sp).copy(letterSpacing = 0.3.sp), color = skin.palette.ink
                                )
                                Text(
                                    "${formatDuration(pillar.minutes)} · ${(pillar.share * 100).toInt()}%",
                                    style = bhSans(skin, 11.sp), color = skin.palette.inkMuted
                                )
                            }
                        }
                    }
                    if (openMinutes > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(
                                Modifier
                                    .size(16.dp)
                                    .drawBehind {
                                        drawRect(
                                            skin.palette.inkMuted,
                                            style = Stroke(2.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())))
                                        )
                                    }
                            )
                            Column {
                                Text("OPEN", style = bhLabel(skin, 14.sp).copy(letterSpacing = 0.3.sp), color = skin.palette.inkMuted)
                                val openPct = (100f * openMinutes / capacity).toInt()
                                Text(
                                    "${formatDuration(openMinutes)} · $openPct%",
                                    style = bhSans(skin, 11.sp), color = skin.palette.inkMuted
                                )
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
        }

        // red caution bar, full bleed
        if (gauges.missingPillars.isNotEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(skin.palette.accent)
                    .padding(horizontal = 18.dp, vertical = 10.dp)
            ) {
                Text(
                    "NOTHING TODAY FROM: ${gauges.missingPillars.joinToString(", ").uppercase(Locale.UK)}",
                    style = bhLabel(skin, 11.sp), color = skin.palette.onAccent, modifier = Modifier.weight(1f)
                )
                Text("!", style = bhDisplay(skin, 16.sp), color = skin.palette.onAccent)
            }
        }
    }
}
