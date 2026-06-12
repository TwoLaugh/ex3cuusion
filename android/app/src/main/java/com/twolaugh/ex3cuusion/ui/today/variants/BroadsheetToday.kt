package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
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
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.core.domain.dayShapeNudge
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

// T109 d1 BROADSHEET — editorial print, ink on cream, one red. Masthead serif date, double
// rules, hatched capacity bar with italic annotations, THE AGENDA numbered list, DAILY
// OBSERVANCES two-column checkbox grid, THE TRAY footer line. All data from ui.view; all
// writes through VariantActions; tokens from LocalSkin (intended skin: BroadsheetSkin).

private val BS_DOW = DateTimeFormatter.ofPattern("EEEE", Locale.UK)
private val BS_DAY = DateTimeFormatter.ofPattern("d MMMM", Locale.UK)

private fun bsSerif(skin: Ex3Skin, size: TextUnit, italic: Boolean = false) = TextStyle(
    fontFamily = skin.type.display,
    fontSize = size,
    fontWeight = FontWeight.Normal,
    fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal
)

// Smallcaps stand-in: the meta face, semibold, letterspaced; callers pass UPPERCASE text.
private fun bsCaps(skin: Ex3Skin, size: TextUnit = 10.sp) = TextStyle(
    fontFamily = skin.type.meta,
    fontSize = size,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = skin.type.labelLetterSpacing
)

// A newspaper rule: double = heavy top + fine bottom, else a single fine ink rule.
@Composable
private fun BsRule(skin: Ex3Skin, double: Boolean = false) {
    if (double) {
        Column {
            Box(Modifier.fillMaxWidth().height(3.dp).background(skin.palette.ink))
            Spacer(Modifier.height(2.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(skin.palette.ink))
        }
    } else {
        Box(Modifier.fillMaxWidth().height(1.dp).background(skin.palette.ink))
    }
}

@Composable
private fun BsSectionHead(skin: Ex3Skin, text: String, trailing: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.weight(1f).height(1.dp).background(skin.palette.ink))
        Text(text, style = bsCaps(skin, 11.sp), color = skin.palette.ink)
        trailing?.invoke()
        Box(Modifier.weight(1f).height(1.dp).background(skin.palette.ink))
    }
}

// Roman volume numeral for the masthead flourish ("Vol. XXVI" = years since 2000).
private fun bsRoman(n: Int): String {
    if (n <= 0) return "I"
    val values = listOf(100 to "C", 90 to "XC", 50 to "L", 40 to "XL", 10 to "X", 9 to "IX", 5 to "V", 4 to "IV", 1 to "I")
    var rest = n
    return buildString {
        for ((v, s) in values) while (rest >= v) { append(s); rest -= v }
    }
}

@Composable
fun BroadsheetTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val doneCount = view.entries.count { it.completedToday }
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()

    // Horizontal gutter comes in via `modifier` from VariantTodayBody (TodayVariant.bodyGutter).
    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(6.dp))

        // masthead
        Row(Modifier.fillMaxWidth()) {
            Text(
                "VOL. ${bsRoman((parsedDate?.year ?: 2026) - 2000)} — NO. ${parsedDate?.dayOfYear ?: 0}",
                style = bsCaps(skin, 9.sp), color = skin.palette.ink, modifier = Modifier.weight(1f)
            )
            Text(
                "$doneCount OF ${view.entries.size} DONE",
                style = bsCaps(skin, 9.sp), color = skin.palette.accent
            )
        }
        Spacer(Modifier.height(2.dp))
        Text(
            parsedDate?.format(BS_DOW) ?: view.date,
            style = bsSerif(skin, 52.sp), color = skin.palette.ink,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
        Text(
            parsedDate?.format(BS_DAY) ?: "",
            style = bsSerif(skin, 30.sp, italic = true), color = skin.palette.ink,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        BsRule(skin, double = true)

        // capacity: hatched bar + italic annotations
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("CAPACITY", style = bsCaps(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text(
                "${formatDuration(view.gauges.listMinutes)} set, of a ${formatDuration(view.gauges.capacityMinutes)} day",
                style = bsSerif(skin, 15.sp, italic = true), color = skin.palette.ink
            )
        }
        Spacer(Modifier.height(5.dp))
        BsCapacityBar(
            skin = skin,
            listMinutes = view.gauges.listMinutes,
            capacityMinutes = view.gauges.capacityMinutes,
            intents = view.gauges.intentShares
        )
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("BALANCE", style = bsCaps(skin, 9.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
            // The red annotation is THE single day-shape nudge (largest under-deviation past the
            // loose tolerance) — never a per-pillar nag.
            val nudge = dayShapeNudge(view.gauges)
            Text(
                if (nudge != null) {
                    "${nudge.name.lowercase(Locale.UK)}: ${formatDuration(nudge.actualMinutes)} of ~${formatDuration(nudge.intentMinutes)} intended →"
                } else {
                    "the day holds its shape ❧"
                },
                style = bsSerif(skin, 13.sp, italic = true),
                color = if (nudge != null) skin.palette.accent else skin.palette.inkMuted,
                modifier = Modifier.clickable(onClick = actions::openBalance)
            )
        }

        // THE AGENDA
        Spacer(Modifier.height(10.dp))
        BsSectionHead(skin, "THE AGENDA")
        Spacer(Modifier.height(2.dp))
        if (view.entries.isEmpty()) {
            Text(
                "nothing on the docket — consult the tray, or set it down below…",
                style = bsSerif(skin, 15.sp, italic = true), color = skin.palette.inkMuted,
                modifier = Modifier.padding(vertical = 10.dp)
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
                    dismissHintStyle = bsSerif(skin, 18.sp)
                ) {
                    BsAgendaRow(
                        entry = entry,
                        number = index + 1,
                        skin = skin,
                        isNow = entry.taskId == firstUntickedId,
                        isTimerActive = ui.activeTimer?.taskId == entry.taskId,
                        showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                        isEnriching = entry.taskId in ui.enrichingTaskIds,
                        showLeader = index < view.entries.size - 1,
                        actions = actions,
                        drag = drag
                    )
                }
            }
        }
        BsInlineAdd(skin = skin, onCapture = actions::instantCapture)

        // DAILY OBSERVANCES — two-column checkbox grid. The "···" in the section rule arms the
        // edit state: rows gain a dashed outline and a tap opens the TaskSheet.
        if (view.habits.isNotEmpty()) {
            var habitsEditing by remember { mutableStateOf(false) }
            val tickedHabits = view.habits.count { it.completedToday }
            Spacer(Modifier.height(10.dp))
            BsSectionHead(skin, "DAILY OBSERVANCES — $tickedHabits OF ${view.habits.size}") {
                Text(
                    "···",
                    style = bsCaps(skin, 11.sp),
                    color = if (habitsEditing) skin.palette.accent else skin.palette.inkMuted,
                    modifier = Modifier.clickable { habitsEditing = !habitsEditing }.padding(horizontal = 4.dp)
                )
            }
            Spacer(Modifier.height(5.dp))
            val splitAt = (view.habits.size + 1) / 2
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    for (habit in view.habits.take(splitAt)) {
                        BsHabitRow(habit, skin, habitsEditing, onTick = actions::tick, onOpen = actions::openTask)
                    }
                }
                Column(Modifier.weight(1f)) {
                    for (habit in view.habits.drop(splitAt)) {
                        BsHabitRow(habit, skin, habitsEditing, onTick = actions::tick, onOpen = actions::openTask)
                    }
                }
            }
        }

        // THE TRAY footer line (expandable)
        Spacer(Modifier.height(12.dp))
        BsTrayLine(ui = ui, skin = skin, actions = actions)
        Spacer(Modifier.height(16.dp))
    }
}

// Hatched fill to the planned fraction, red day-mark at the fill edge (the mockup's 84% line).
// Day-shape: fine ink tick RULES mark the intent boundaries — cumulative pillar shares of the
// capacity — so the hatch is read against where the day MEANT to apportion itself.
@Composable
private fun BsCapacityBar(
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
    Box(
        Modifier
            .fillMaxWidth()
            .height(9.dp)
            .border(skin.shape.borderWidth, skin.palette.ink)
            .drawBehind {
                val inset = 2.dp.toPx()
                val fillW = (size.width - 2 * inset) * frac
                clipRect(inset, inset, inset + fillW, size.height - inset) {
                    // fine -45° hatching, 2px on / 2px off
                    val step = 4.dp.toPx()
                    var x = -size.height
                    while (x < inset + fillW) {
                        drawLine(
                            skin.palette.ink,
                            start = Offset(x, size.height),
                            end = Offset(x + size.height, 0f),
                            strokeWidth = 2f
                        )
                        x += step
                    }
                }
                // intent tick rules at the cumulative share boundaries (the last lands on the
                // bar's end and is skipped — the border already rules it)
                var cumulative = 0.0
                for (intent in intents.dropLast(1)) {
                    cumulative += intent.share
                    val tx = inset + (size.width - 2 * inset) * cumulative.toFloat()
                    drawLine(
                        skin.palette.ink.copy(alpha = 0.55f),
                        start = Offset(tx, 0f),
                        end = Offset(tx, size.height),
                        strokeWidth = 1.dp.toPx()
                    )
                }
                // the red mark, slightly proud of the bar
                drawRect(
                    skin.palette.accent,
                    topLeft = Offset(inset + fillW - 1.dp.toPx(), -3.dp.toPx()),
                    size = Size(2.dp.toPx(), size.height + 6.dp.toPx())
                )
            }
    )
}

// One agenda entry: hanging italic numeral, serif title, right-set duration + smallcaps tag.
// Hold-to-complete is an ink wash that soaks across the line (the print analogue of the
// checkbox ink fill used in the observances grid).
@Composable
private fun BsAgendaRow(
    entry: DayListEntryView,
    number: Int,
    skin: Ex3Skin,
    isNow: Boolean,
    isTimerActive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    showLeader: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(skin.palette.bg)
            .drawBehind {
                if (showLeader) {
                    // dotted divider between entries
                    drawLine(
                        skin.palette.inkMuted,
                        start = Offset(0f, size.height - 0.5.dp.toPx()),
                        end = Offset(size.width, size.height - 0.5.dp.toPx()),
                        strokeWidth = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx()))
                    )
                }
            }
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                .drawBehind {
                    val p = hold.progress.value
                    if (!ticked && p > 0f) {
                        drawRect(color = skin.palette.ink.copy(alpha = 0.10f * p), size = size.copy(width = size.width * p))
                        drawRect(
                            color = skin.palette.accent,
                            topLeft = Offset(0f, size.height - 2.dp.toPx()),
                            size = Size(size.width * p, 1.5.dp.toPx())
                        )
                    }
                }
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(vertical = 7.dp)
        ) {
            Text(
                "$number.",
                style = bsSerif(skin, 17.sp, italic = true),
                color = if ((isNow || isTimerActive) && !ticked) skin.palette.accent else skin.palette.inkMuted,
                modifier = Modifier.width(20.dp)
            )
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        entry.title,
                        style = bsSerif(skin, 19.sp).copy(
                            textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                        ),
                        color = if (ticked) skin.palette.inkMuted else skin.palette.ink,
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isTimerActive) {
                        Spacer(Modifier.width(8.dp))
                        Text("▶ NOW", style = bsCaps(skin, 9.sp), color = skin.palette.accent)
                    } else if (showPlay) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "▶",
                            style = bsCaps(skin, 10.sp), color = skin.palette.inkMuted,
                            modifier = Modifier.clickable { actions.startTimer(entry.taskId) }.padding(4.dp)
                        )
                    }
                }
                val annotation = bsRowAnnotation(entry, isEnriching)
                if (annotation != null) {
                    Text(
                        annotation,
                        style = bsSerif(skin, 13.sp, italic = true),
                        color = if (entry.missedPin && !isEnriching) skin.palette.missed else skin.palette.inkMuted
                    )
                }
                if (entry.carryNudge && !ticked) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text(
                            "to someday", style = bsSerif(skin, 13.sp, italic = true), color = skin.palette.accent,
                            modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 3.dp)
                        )
                        Text(
                            "let it go", style = bsSerif(skin, 13.sp, italic = true), color = skin.palette.accent,
                            modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 3.dp)
                        )
                    }
                }
            }
            Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 10.dp)) {
                Text("${entry.effortMinutes}m", style = bsSerif(skin, 16.sp), color = skin.palette.ink)
                val tag = entry.pinnedTime ?: folderLeaf(entry.folderPath)?.uppercase(Locale.UK)
                if (tag != null) {
                    Text(tag, style = bsCaps(skin, 8.sp), color = skin.palette.inkMuted, maxLines = 1)
                }
            }
        }
        // the reorder grip, set like a compositor's mark in the margin; a press without a drag
        // opens the row's action menu (grip double duty, same as warm-dark)
        VariantGripHandle(
            state = drag,
            id = entry.taskId,
            onEdit = { actions.openTask(entry.taskId) },
            onLogProgress = { actions.openTask(entry.taskId) },
            onArchive = { actions.archiveTask(entry.taskId) },
            modifier = Modifier.size(width = 34.dp, height = 44.dp)
        ) {
            Text("⁞", style = bsSerif(skin, 18.sp), color = skin.palette.inkMuted)
        }
    }
}

private fun bsRowAnnotation(entry: DayListEntryView, isEnriching: Boolean): String? {
    if (isEnriching) return "filing…"
    val parts = buildList {
        entry.carriedCount?.takeIf { it >= 1 }?.let { add("carried $it day${if (it == 1) "" else "s"}") }
        if (entry.pinnedTime != null && entry.missedPin) add("missed its ${entry.pinnedTime} appointment")
        // logged progress, set as an editor's aside
        if (entry.progressMinutesToday > 0 && !entry.completedToday) {
            add("${entry.progressMinutesToday}m of ${entry.effortMinutes}m logged")
        }
    }
    return parts.joinToString(" — ").ifEmpty { null }
}

@Composable
private fun BsInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp)) {
        Text("＋", style = bsSerif(skin, 15.sp, italic = true), color = skin.palette.inkMuted, modifier = Modifier.width(20.dp))
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = bsSerif(skin, 16.sp).copy(color = skin.palette.ink),
            cursorBrush = SolidColor(skin.palette.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                val text = draft.trim()
                draft = "" // clears immediately; enrichment runs async (T105)
                if (text.isNotEmpty()) onCapture(text) else focusManager.clearFocus()
            }),
            decorationBox = { innerTextField ->
                Box {
                    if (draft.isEmpty()) {
                        Text("type to add an entry…", style = bsSerif(skin, 15.sp, italic = true), color = skin.palette.inkMuted)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier.weight(1f).padding(vertical = 10.dp)
        )
    }
}

// One observance: square ink checkbox + narrow sans name; hold-to-complete FILLS the checkbox
// with ink as the press runs (the broadsheet restyle of the hold ring). In the edit state the
// row gains a dashed outline and a TAP opens the TaskSheet instead.
@Composable
private fun BsHabitRow(
    habit: DayListHabitView,
    skin: Ex3Skin,
    editing: Boolean,
    onTick: (String) -> Unit,
    onOpen: (String) -> Unit
) {
    val ticked = habit.completedToday
    val hold = rememberHoldToComplete()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (editing) {
                    Modifier
                        .habitEditOutline(skin.palette.accent.copy(alpha = 0.6f), 2.dp)
                        .clickable { onOpen(habit.taskId) }
                } else {
                    Modifier.holdToComplete(hold, durationMs = 450, onComplete = { onTick(habit.taskId) })
                }
            )
            .padding(vertical = 3.dp)
    ) {
        Box(
            Modifier
                .size(11.dp)
                .border(1.5.dp, skin.palette.ink)
                .drawBehind {
                    val p = if (ticked) 1f else hold.progress.value
                    if (p > 0f) {
                        // ink rises from the bottom of the box, like a nib filling a square
                        val h = size.height * p
                        drawRect(skin.palette.ink, topLeft = Offset(0f, size.height - h), size = Size(size.width, h))
                    }
                }
        )
        Text(
            habitShort(habit.title),
            style = TextStyle(fontFamily = skin.type.meta, fontSize = 12.5.sp, fontWeight = FontWeight.Medium),
            color = if (ticked) skin.palette.inkMuted else skin.palette.ink,
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun BsTrayLine(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    Column {
        BsRule(skin)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.fillMaxWidth().clickable { expanded = !expanded },
            verticalAlignment = Alignment.Bottom
        ) {
            Text("THE TRAY", style = bsCaps(skin, 9.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text(
                "${suggestions.size} suggestion${if (suggestions.size == 1) "" else "s"} held for review ❧",
                style = bsSerif(skin, 14.sp, italic = true), color = skin.palette.ink
            )
        }
        if (expanded) {
            Spacer(Modifier.height(4.dp))
            for (task in suggestions) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            task.title, style = bsSerif(skin, 16.sp), color = skin.palette.ink,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                        if (task.staleQuestion) {
                            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Text(
                                    "to someday?", style = bsSerif(skin, 13.sp, italic = true), color = skin.palette.accent,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                                )
                                Text(
                                    "keep it", style = bsSerif(skin, 13.sp, italic = true), color = skin.palette.inkMuted,
                                    modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                                )
                            }
                        }
                    }
                    Text("${task.effortMinutes}m", style = bsSerif(skin, 14.sp), color = skin.palette.inkMuted)
                    Spacer(Modifier.width(12.dp))
                    Text(
                        "add", style = bsSerif(skin, 14.sp, italic = true), color = skin.palette.accent,
                        modifier = Modifier.clickable { actions.addFromTray(task.taskId) }.padding(vertical = 4.dp, horizontal = 2.dp)
                    )
                }
            }
        }
    }
}

// ── BALANCE — THE LEDGER ─────────────────────────────────────────────────────────────────────────
// Pillar differentiation by HATCH PATTERN, not color: six distinct drawBehind patterns, all in
// plain ink, exactly as the mockup's D1_HATCH set.

private fun DrawScope.bsHatch(index: Int, color: Color) = clipRect {
    val step = 4.dp.toPx()
    when (index % 6) {
        0 -> { // -45° diagonal, 2px lines
            var x = -size.height
            while (x < size.width) {
                drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), 2f)
                x += step
            }
        }
        1 -> { // +45° diagonal
            var x = -size.height
            while (x < size.width) {
                drawLine(color, Offset(x, 0f), Offset(x + size.height, size.height), 2f)
                x += step
            }
        }
        2 -> { // horizontal lines
            var y = 0f
            while (y < size.height) {
                drawLine(color, Offset(0f, y), Offset(size.width, y), 2f)
                y += step
            }
        }
        3 -> { // vertical lines
            var x = 0f
            while (x < size.width) {
                drawLine(color, Offset(x, 0f), Offset(x, size.height), 2f)
                x += step
            }
        }
        4 -> { // dot grid
            var y = step / 2
            while (y < size.height) {
                var x = step / 2
                while (x < size.width) {
                    drawCircle(color, radius = 1.2.dp.toPx(), center = Offset(x, y))
                    x += step
                }
                y += step
            }
        }
        else -> { // sparse fine diagonal
            val sparse = 6.dp.toPx()
            var x = -size.height
            while (x < size.width) {
                drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), 1f)
                x += sparse
            }
        }
    }
}

@Composable
fun BroadsheetBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()
    val openMinutes = max(0, gauges.capacityMinutes - gauges.listMinutes)
    val planPct = if (gauges.capacityMinutes > 0) (100f * gauges.listMinutes / gauges.capacityMinutes).toInt() else 0

    Column(modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
        Spacer(Modifier.height(6.dp))
        Text(
            "${(parsedDate?.format(BS_DOW) ?: view.date).uppercase(Locale.UK)} ${parsedDate?.format(BS_DAY)?.uppercase(Locale.UK) ?: ""} — SECTION B",
            style = bsCaps(skin, 9.sp), color = skin.palette.ink,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
        Text(
            "The Ledger", style = bsSerif(skin, 46.sp), color = skin.palette.ink,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
        Text(
            "${formatDuration(gauges.listMinutes)} planned of a ${formatDuration(gauges.capacityMinutes)} day",
            style = bsSerif(skin, 16.sp, italic = true), color = skin.palette.inkMuted,
            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        BsRule(skin, double = true)
        Spacer(Modifier.height(8.dp))

        // composition bar: hatched segments by share, open day left blank
        Row(Modifier.fillMaxWidth().height(26.dp).border(skin.shape.borderWidth, skin.palette.ink)) {
            gauges.balance.forEachIndexed { i, pillar ->
                val weight = max(0.0001f, pillar.minutes.toFloat())
                Box(
                    Modifier
                        .weight(weight)
                        .fillMaxHeight()
                        .drawBehind {
                            bsHatch(i, skin.palette.ink)
                            if (i < gauges.balance.size - 1 || openMinutes > 0) {
                                drawRect(skin.palette.ink, topLeft = Offset(size.width - 1f, 0f), size = Size(1f, size.height))
                            }
                        }
                )
            }
            if (openMinutes > 0) Box(Modifier.weight(max(0.0001f, openMinutes.toFloat())).fillMaxHeight())
        }
        Spacer(Modifier.height(3.dp))
        Row(Modifier.fillMaxWidth()) {
            Text("PLANNED — $planPct PERCENT", style = bsCaps(skin, 8.sp), color = skin.palette.inkMuted, modifier = Modifier.weight(1f))
            Text("OPEN — ${formatDuration(openMinutes).uppercase(Locale.UK)}", style = bsCaps(skin, 8.sp), color = skin.palette.inkMuted)
        }

        // ledger table: hatch swatch, name, dotted leader, time + "of ~Xh intended", percent
        Spacer(Modifier.height(12.dp))
        val deviationById = gauges.deviations.associateBy { it.folderId }
        gauges.balance.forEachIndexed { i, pillar ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .drawBehind {
                        drawLine(
                            skin.palette.inkMuted,
                            start = Offset(0f, size.height - 0.5.dp.toPx()),
                            end = Offset(size.width, size.height - 0.5.dp.toPx()),
                            strokeWidth = 1.dp.toPx(),
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx()))
                        )
                    }
                    .padding(vertical = 8.dp)
            ) {
                Box(
                    Modifier
                        .size(width = 22.dp, height = 12.dp)
                        .border(1.dp, skin.palette.ink)
                        .drawBehind { bsHatch(i, skin.palette.ink) }
                )
                Spacer(Modifier.width(8.dp))
                Text(pillar.name, style = bsSerif(skin, 20.sp), color = skin.palette.ink)
                // dotted leader
                Box(
                    Modifier
                        .weight(1f)
                        .height(1.dp)
                        .padding(horizontal = 6.dp)
                        .drawBehind {
                            drawLine(
                                skin.palette.inkMuted, Offset(0f, 0f), Offset(size.width, 0f),
                                strokeWidth = 1.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.5.dp.toPx(), 3.dp.toPx()))
                            )
                        }
                )
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatDuration(pillar.minutes), style = bsSerif(skin, 18.sp), color = skin.palette.ink)
                    val intentMinutes = deviationById[pillar.folderId]?.intentMinutes
                    if (intentMinutes != null) {
                        Text(
                            "of ~${formatDuration(intentMinutes)} intended",
                            style = bsSerif(skin, 12.sp, italic = true), color = skin.palette.inkMuted
                        )
                    }
                }
                Text(
                    "${(pillar.share * 100).toInt()}%",
                    style = bsCaps(skin, 11.sp), color = skin.palette.inkMuted,
                    textAlign = TextAlign.End, modifier = Modifier.width(38.dp)
                )
            }
        }

        // the one red notice = THE day-shape nudge (largest under-deviation, loose tolerance)
        val nudge = dayShapeNudge(gauges)
        if (nudge != null) {
            Spacer(Modifier.height(14.dp))
            Text(
                "Notice — ${nudge.name}: ${formatDuration(nudge.actualMinutes)} of ~${formatDuration(nudge.intentMinutes)} intended.",
                style = bsSerif(skin, 17.sp, italic = true), color = skin.palette.accent,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()
            )
        }
        Spacer(Modifier.height(12.dp))
        Text("❦", style = bsSerif(skin, 18.sp), color = skin.palette.ink, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
    }
}
