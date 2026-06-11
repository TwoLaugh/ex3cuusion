package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.DayListEntryView
import com.twolaugh.ex3cuusion.core.domain.DayListHabitView
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.today.UiState
import com.twolaugh.ex3cuusion.ui.today.holdToComplete
import com.twolaugh.ex3cuusion.ui.today.rememberHoldToComplete
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

// T109 d2 PHOSPHOR — amber CRT terminal, mono everything. STATUS block (text capacity bar +
// missing-pillar warning line), HABITS as a two-column bracket-checkbox grid, LIST with
// bracket-marked rows (active row highlighted with a left bar), block-cursor inline add,
// dashed TRAY box, and subtle drawBehind scanlines over the whole body. All data from ui.view;
// all writes through VariantActions; tokens from LocalSkin (intended skin: PhosphorSkin).

private val PH_DATE = DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)

private fun phMono(skin: Ex3Skin, size: TextUnit = 12.5.sp, weight: FontWeight = FontWeight.Normal) = TextStyle(
    fontFamily = skin.type.meta,
    fontSize = size,
    fontWeight = weight,
    lineHeight = (size.value * 1.55f).sp
)

// ──┤ LABEL ├──────── divider: short lead-in line, bracketed label, rule to the edge.
@Composable
private fun PhDivider(skin: Ex3Skin, label: String) {
    val dim = skin.palette.inkMuted
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(top = 7.dp, bottom = 3.dp)
    ) {
        Box(Modifier.width(14.dp).height(1.dp).background(dim))
        Text("┤ $label ├", style = phMono(skin, 11.5.sp), color = dim)
        Box(Modifier.weight(1f).height(1.dp).background(dim))
    }
}

// Text-mode bar: ▓ filled / ░ rest, amber on faint, fixed character width.
private fun phBar(skin: Ex3Skin, frac: Float, width: Int = 16) = buildAnnotatedString {
    val filled = (frac.coerceIn(0f, 1f) * width).roundToInt()
    withStyle(SpanStyle(color = skin.palette.ink)) { append("▓".repeat(filled)) }
    withStyle(SpanStyle(color = skin.palette.inkFaint)) { append("░".repeat(width - filled)) }
}

@Composable
fun PhosphorTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val amber = skin.palette.ink
    val dim = skin.palette.inkMuted
    val doneCount = view.entries.count { it.completedToday }
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()

    Column(
        modifier
            .fillMaxWidth()
            // subtle CRT scanlines behind the content: a 1dp dark band every 3dp
            .drawBehind {
                val step = 3.dp.toPx()
                val band = 1.dp.toPx()
                var y = 0f
                while (y < size.height) {
                    drawRect(Color.Black.copy(alpha = 0.22f), topLeft = Offset(0f, y), size = Size(size.width, band))
                    y += step
                }
            }
    ) {
        Spacer(Modifier.height(8.dp))

        // header
        Row {
            Text(
                (parsedDate?.format(PH_DATE) ?: view.date).uppercase(Locale.UK),
                style = phMono(skin, 15.sp, FontWeight.Bold), color = amber
            )
            Text(
                " · DAY ${parsedDate?.dayOfYear ?: "—"}",
                style = phMono(skin, 15.sp, FontWeight.Bold), color = dim
            )
        }
        Text("your list — $doneCount done", style = phMono(skin), color = dim)

        // STATUS: capacity percent bar line + warning line for missing pillars
        PhDivider(skin, "STATUS")
        val gauges = view.gauges
        val frac = when {
            gauges.capacityMinutes > 0 -> gauges.listMinutes.toFloat() / gauges.capacityMinutes
            gauges.listMinutes > 0 -> 1f
            else -> 0f
        }
        Column(Modifier.clickable(onClick = actions::openBalance)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("CAP ", style = phMono(skin), color = amber)
                Text(phBar(skin, frac), style = phMono(skin, 13.sp))
                Text(" ${(frac * 100).roundToInt()}%", style = phMono(skin), color = amber)
            }
            Text(
                "    ${gauges.listMinutes}m planned / ${gauges.capacityMinutes}m available",
                style = phMono(skin), color = dim
            )
        }
        val missing = gauges.missingPillars.firstOrNull()
        if (missing != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                Text("${missing.take(3).uppercase(Locale.UK)} ", style = phMono(skin), color = amber)
                Box(Modifier.background(amber).padding(horizontal = 5.dp)) {
                    Text("!", style = phMono(skin, 12.5.sp, FontWeight.Bold), color = skin.palette.bg)
                }
                Text(" no ${missing.lowercase(Locale.UK)} planned", style = phMono(skin), color = amber)
            }
        }

        // HABITS: two-column bracket-checkbox grid
        if (view.habits.isNotEmpty()) {
            val ticked = view.habits.count { it.completedToday }
            PhDivider(skin, "HABITS $ticked/${view.habits.size}")
            val splitAt = (view.habits.size + 1) / 2
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    for (habit in view.habits.take(splitAt)) PhHabitLine(habit, skin, onTick = actions::tick)
                }
                Column(Modifier.weight(1f)) {
                    for (habit in view.habits.drop(splitAt)) PhHabitLine(habit, skin, onTick = actions::tick)
                }
            }
        }

        // LIST: bracket-marked rows, active row highlighted
        PhDivider(skin, "LIST ${view.entries.size}")
        if (view.entries.isEmpty()) {
            Text("no entries — pull from the tray or type below", style = phMono(skin), color = dim)
        }
        val drag = rememberVariantDragState(view.entries.map { it.taskId }, actions::reorder)
        val firstUntickedId = view.entries.firstOrNull { !it.completedToday }?.taskId
        for (entry in view.entries) {
            Box(Modifier.fillMaxWidth().variantDragRow(drag, entry.taskId)) {
                VariantDismissibleRow(
                    anyDragging = drag.anyDragging,
                    onRemove = { actions.removeFromList(entry.taskId) },
                    dismissHint = dim,
                    dismissHintStyle = phMono(skin, 16.sp)
                ) {
                    PhListRow(
                        entry = entry,
                        skin = skin,
                        isActive = ui.activeTimer?.taskId == entry.taskId,
                        showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                        isEnriching = entry.taskId in ui.enrichingTaskIds,
                        actions = actions,
                        drag = drag
                    )
                }
            }
        }
        PhInlineAdd(skin = skin, onCapture = actions::instantCapture)

        // TRAY: dashed box, expandable
        Spacer(Modifier.height(12.dp))
        PhTrayBox(ui = ui, skin = skin, actions = actions)
        Spacer(Modifier.height(16.dp))
    }
}

// "[ ] seal technique" — hold floods the line with faint amber; ticked = inverse-video [x].
@Composable
private fun PhHabitLine(habit: DayListHabitView, skin: Ex3Skin, onTick: (String) -> Unit) {
    val ticked = habit.completedToday
    val hold = rememberHoldToComplete()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                val p = hold.progress.value
                if (!ticked && p > 0f) {
                    drawRect(skin.palette.ink.copy(alpha = 0.18f), size = size.copy(width = size.width * p))
                }
            }
            .holdToComplete(hold, durationMs = 450, onComplete = { onTick(habit.taskId) })
            .padding(vertical = 1.dp)
    ) {
        Text(if (ticked) "[x]" else "[ ]", style = phMono(skin, 12.sp), color = skin.palette.ink)
        Text(
            " " + habitShort(habit.title).lowercase(Locale.UK),
            style = phMono(skin, 12.sp),
            color = if (ticked) skin.palette.inkFaint else skin.palette.inkMuted,
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
        if (habit.streak >= 2) {
            Text(" ×${habit.streak}", style = phMono(skin, 10.sp), color = skin.palette.inkFaint)
        }
    }
}

// "[▶] dogfood the planner   45m" + "└ tag" sub-line; active row gets the amber wash + left bar.
@Composable
private fun PhListRow(
    entry: DayListEntryView,
    skin: Ex3Skin,
    isActive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val amber = skin.palette.ink
    val dim = skin.palette.inkMuted
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()
    Row(
        Modifier
            .fillMaxWidth()
            .background(skin.palette.bg) // opaque under the swipe-to-dismiss reveal
            .drawBehind {
                if (isActive) {
                    drawRect(amber.copy(alpha = 0.12f))
                    drawRect(amber, size = Size(3.dp.toPx(), size.height))
                }
            }
    ) {
        Column(
            Modifier
                .weight(1f)
                .drawBehind {
                    val p = hold.progress.value
                    if (!ticked && p > 0f) {
                        drawRect(amber.copy(alpha = 0.18f), size = size.copy(width = size.width * p))
                    }
                }
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(start = if (isActive) 9.dp else 3.dp, top = 3.dp, bottom = 3.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val bracket = when {
                    ticked -> "[x]"
                    isActive -> "[▶]"
                    else -> "[ ]"
                }
                Text(bracket, style = phMono(skin), color = amber)
                Spacer(Modifier.width(8.dp))
                Text(
                    entry.title.lowercase(Locale.UK),
                    style = phMono(skin, 12.5.sp, if (isActive) FontWeight.Bold else FontWeight.Normal).copy(
                        textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                    ),
                    color = if (ticked) skin.palette.inkFaint else amber,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (showPlay && !ticked) {
                    Text(
                        "▶", style = phMono(skin, 12.sp), color = dim,
                        modifier = Modifier.clickable { actions.startTimer(entry.taskId) }.padding(horizontal = 6.dp)
                    )
                }
                Text("${entry.effortMinutes}m", style = phMono(skin, 12.5.sp, FontWeight.Bold), color = if (ticked) skin.palette.inkFaint else amber)
            }
            Text(
                "└ " + phRowMeta(entry, isEnriching),
                style = phMono(skin, 11.sp),
                color = if (entry.missedPin && !isEnriching) amber else dim,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 30.dp)
            )
            if (entry.carryNudge && !ticked) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(start = 30.dp)) {
                    Text(
                        "[someday]", style = phMono(skin, 11.sp), color = dim,
                        modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 2.dp)
                    )
                    Text(
                        "[let go]", style = phMono(skin, 11.sp), color = dim,
                        modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 2.dp)
                    )
                }
            }
        }
        // reorder grip
        Box(
            Modifier.width(34.dp).fillMaxHeight().heightIn(min = 36.dp).variantDragHandle(drag, entry.taskId),
            contentAlignment = Alignment.Center
        ) {
            Text("≡", style = phMono(skin, 13.sp), color = skin.palette.inkFaint)
        }
    }
}

private fun phRowMeta(entry: DayListEntryView, isEnriching: Boolean): String {
    if (isEnriching) return "filing..."
    val carried = entry.carriedCount?.takeIf { it >= 1 }?.let { "carried ${it}d · " } ?: ""
    val tag = folderLeaf(entry.folderPath)?.lowercase(Locale.UK)
    val main = when {
        entry.pinnedTime != null -> entry.pinnedTime + (tag?.let { " · $it" } ?: "")
        tag != null -> tag
        else -> "unfiled"
    }
    return carried + main
}

// "> type to add▮" — the prompt-style inline capture with a blinking block cursor.
@Composable
private fun PhInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val blink by rememberInfiniteTransition(label = "phCursor").animateFloat(
        initialValue = 1f, targetValue = 0f,
        animationSpec = infiniteRepeatable(tween(530, easing = LinearEasing), RepeatMode.Reverse),
        label = "phCursorAlpha"
    )
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp)) {
        Text("> ", style = phMono(skin, 12.5.sp), color = skin.palette.ink)
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = phMono(skin, 12.5.sp).copy(color = skin.palette.ink),
            cursorBrush = SolidColor(skin.palette.ink),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                val text = draft.trim()
                draft = "" // clears immediately; enrichment runs async (T105)
                if (text.isNotEmpty()) onCapture(text) else focusManager.clearFocus()
            }),
            decorationBox = { innerTextField ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (draft.isEmpty()) {
                        Text("type to add", style = phMono(skin, 12.5.sp), color = skin.palette.inkMuted)
                        // the block cursor, parked at the end of the prompt
                        Box(
                            Modifier
                                .size(width = 7.dp, height = 14.dp)
                                .background(skin.palette.ink.copy(alpha = blink))
                        )
                    }
                    innerTextField()
                }
            },
            modifier = Modifier.weight(1f).padding(vertical = 10.dp)
        )
    }
}

@Composable
private fun PhTrayBox(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    val dim = skin.palette.inkMuted
    Column(
        Modifier
            .fillMaxWidth()
            .drawBehind {
                drawRect(
                    color = dim,
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx()))
                    )
                )
            }
            .clickable { expanded = !expanded }
            .padding(horizontal = 10.dp, vertical = 5.dp)
    ) {
        Row(Modifier.fillMaxWidth()) {
            Text("TRAY", style = phMono(skin, 12.5.sp, FontWeight.Bold), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text(
                "${suggestions.size} suggestions ${if (expanded) "▾" else "▸"}",
                style = phMono(skin, 12.5.sp), color = dim
            )
        }
        if (expanded) {
            Spacer(Modifier.height(4.dp))
            for (task in suggestions) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            task.title.lowercase(Locale.UK), style = phMono(skin, 12.sp), color = skin.palette.ink,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                        val notes = buildList {
                            task.pillarName?.let { add("fills ${it.lowercase(Locale.UK)}") }
                            if (task.fitsGap) add("fits gap")
                            if (task.resurfaced) add("resurfaced")
                        }
                        if (notes.isNotEmpty()) {
                            Text("└ " + notes.joinToString(" · "), style = phMono(skin, 10.5.sp), color = dim)
                        }
                        if (task.staleQuestion) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(
                                    "[someday?]", style = phMono(skin, 11.sp), color = skin.palette.ink,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                                )
                                Text(
                                    "[keep]", style = phMono(skin, 11.sp), color = dim,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text("${task.effortMinutes}m", style = phMono(skin, 11.sp), color = dim)
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "[add+]", style = phMono(skin, 11.sp, FontWeight.Bold), color = skin.palette.ink,
                        modifier = Modifier.clickable { actions.addFromTray(task.taskId) }.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }
}

// ── BALANCE — DRAW BY AREA ───────────────────────────────────────────────────────────────────────

@Composable
fun PhosphorBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val amber = skin.palette.ink
    val dim = skin.palette.inkMuted
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()
    val maxShare = gauges.balance.maxOfOrNull { it.share }?.takeIf { it > 0 } ?: 1.0
    val openMinutes = max(0, gauges.capacityMinutes - gauges.listMinutes)
    val frac = when {
        gauges.capacityMinutes > 0 -> (gauges.listMinutes.toFloat() / gauges.capacityMinutes).coerceIn(0f, 1f)
        gauges.listMinutes > 0 -> 1f
        else -> 0f
    }

    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row {
            Text("BALANCE", style = phMono(skin, 15.sp, FontWeight.Bold), color = amber)
            Text(
                " · ${(parsedDate?.format(PH_DATE) ?: view.date).uppercase(Locale.UK)}",
                style = phMono(skin, 15.sp, FontWeight.Bold), color = dim
            )
        }
        Text("${gauges.listMinutes}m planned / ${gauges.capacityMinutes}m capacity", style = phMono(skin), color = dim)

        PhDivider(skin, "DRAW BY AREA")
        gauges.balance.forEach { pillar ->
            Column(Modifier.padding(bottom = 9.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Text(
                        pillar.name.uppercase(Locale.UK),
                        style = phMono(skin, 11.5.sp).copy(letterSpacing = skin.type.labelLetterSpacing),
                        color = dim, modifier = Modifier.weight(1f)
                    )
                    Text("${pillar.minutes}m ", style = phMono(skin, 11.5.sp), color = amber)
                    Text("· ${(pillar.share * 100).toInt()}%", style = phMono(skin, 11.5.sp), color = dim)
                }
                Spacer(Modifier.height(3.dp))
                // segmented amber area bar: block segments to share-of-max, faint track behind
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .drawBehind {
                            // segment grid (6dp on / 2dp gap); amber up to the fill edge, faint
                            // track segments beyond it — the lit/unlit cell split lands mid-segment
                            // when the share does.
                            val seg = 6.dp.toPx()
                            val gap = 2.dp.toPx()
                            val faint = skin.palette.inkFaint.copy(alpha = 0.5f)
                            val fillW = size.width * (pillar.share / maxShare).toFloat()
                            var x = 0f
                            while (x < size.width) {
                                val segEnd = kotlin.math.min(x + seg, size.width)
                                val litEnd = kotlin.math.min(segEnd, kotlin.math.max(x, fillW))
                                if (litEnd > x) drawRect(amber, topLeft = Offset(x, 0f), size = Size(litEnd - x, size.height))
                                if (segEnd > litEnd) drawRect(faint, topLeft = Offset(litEnd, 0f), size = Size(segEnd - litEnd, size.height))
                                x += seg + gap
                            }
                        }
                )
            }
        }

        PhDivider(skin, "TOTALS")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("PLANNED  ", style = phMono(skin), color = amber)
            Text(phBar(skin, frac, 14), style = phMono(skin, 13.sp))
            Text(" ${formatClock(gauges.listMinutes)}", style = phMono(skin), color = amber)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("OPEN     ", style = phMono(skin), color = amber)
            Text(phBar(skin, 1f - frac, 14), style = phMono(skin, 13.sp))
            Text(" ${formatClock(openMinutes)}", style = phMono(skin), color = amber)
        }

        if (gauges.missingPillars.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .drawBehind { drawRect(amber, style = Stroke(1.dp.toPx())) }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Text("! WARNING", style = phMono(skin, 12.5.sp, FontWeight.Bold), color = amber)
                Text(
                    "nothing today from: ${gauges.missingPillars.joinToString(", ").lowercase(Locale.UK)}",
                    style = phMono(skin, 12.sp), color = dim
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}
