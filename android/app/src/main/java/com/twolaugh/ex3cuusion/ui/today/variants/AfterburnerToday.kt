package com.twolaugh.ex3cuusion.ui.today.variants

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
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
import com.twolaugh.ex3cuusion.ui.today.formatDuration
import com.twolaugh.ex3cuusion.ui.today.holdToComplete
import com.twolaugh.ex3cuusion.ui.today.rememberHoldToComplete
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.tan

// T109 d5 AFTERBURNER — OLED energy: heat-gradient accent pair on near-black. Big-numeral header
// (rajdhani) with planned/capacity + percent, skewed segmented gradient power cells + a per-pillar
// mini strip, habits as small pill chips, list rows with neon pillar bars and a LIVE badge on the
// timer row, gradient tray bar. All data from ui.view; all writes through VariantActions; tokens
// from LocalSkin (intended skin: AfterburnerSkin — accent = hot orange, accentSoft = pink).

private val AB_DOW = DateTimeFormatter.ofPattern("EEEE", Locale.UK)
private val AB_DAYNUM = DateTimeFormatter.ofPattern("dd.MM", Locale.UK)

private fun abLabel(skin: Ex3Skin, size: TextUnit = 9.5.sp) = TextStyle(
    fontFamily = skin.type.body, // Archivo
    fontSize = size,
    fontWeight = FontWeight.Bold,
    letterSpacing = 2.sp // the mockup's 0.22em tracking
)

private fun abNum(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.Bold) = TextStyle(
    fontFamily = skin.type.meta, // Rajdhani
    fontSize = size,
    fontWeight = weight
)

private fun abSans(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.SemiBold) = TextStyle(
    fontFamily = skin.type.body,
    fontSize = size,
    fontWeight = weight
)

// The heat pair: accent (hot orange) → accentSoft (pink).
private fun abGradient(skin: Ex3Skin) = listOf(skin.palette.accent, skin.palette.accentSoft)

// Gradient-inked text span (the mockup's background-clip:text trick).
private fun abGradText(skin: Ex3Skin, text: String) = buildAnnotatedString {
    withStyle(SpanStyle(brush = Brush.horizontalGradient(abGradient(skin)))) { append(text) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AfterburnerTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val doneCount = view.entries.count { it.completedToday }
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()
    val pink = skin.palette.accentSoft

    // Horizontal gutter comes in via `modifier` from VariantTodayBody (TodayVariant.bodyGutter).
    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(6.dp))

        // header: big numeral date, gradient day figure, missing-pillar alert chip
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = skin.palette.ink)) {
                            append((parsedDate?.format(AB_DOW) ?: view.date).uppercase(Locale.UK) + " ")
                        }
                        withStyle(SpanStyle(brush = Brush.horizontalGradient(abGradient(skin)))) {
                            append(parsedDate?.format(AB_DAYNUM) ?: "")
                        }
                    },
                    style = abNum(skin, 26.sp).copy(letterSpacing = 0.8.sp)
                )
                Text("YOUR LIST · $doneCount DONE", style = abLabel(skin), color = skin.palette.inkMuted)
            }
            val missing = view.gauges.missingPillars.firstOrNull()
            if (missing != null) {
                Text(
                    "${missing.take(3).uppercase(Locale.UK)} 0",
                    style = abNum(skin, 13.sp), color = pink,
                    modifier = Modifier
                        .border(1.dp, pink, RoundedCornerShape(3.dp))
                        .clickable(onClick = actions::openBalance)
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                )
            }
        }

        // power hero: percent, big planned/capacity numerals, gradient cells, pillar mini strip
        Spacer(Modifier.height(10.dp))
        AbPowerHero(ui = ui, skin = skin, onTap = actions::openBalance)

        // habits: pill chips. Chips stay a pure completion surface; the ONE trailing "···" chip
        // arms the edit state (dashed outlines, tap opens the TaskSheet).
        if (view.habits.isNotEmpty()) {
            var habitsEditing by remember { mutableStateOf(false) }
            val ticked = view.habits.count { it.completedToday }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
                Text("DAILY LOOPS", style = abLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
                Text("$ticked/${view.habits.size}", style = abNum(skin, 12.sp), color = skin.palette.inkMuted)
            }
            Spacer(Modifier.height(6.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                for (habit in view.habits) {
                    AbHabitChip(
                        habit = habit, skin = skin, editing = habitsEditing,
                        onTick = { actions.tick(habit.taskId) }, onOpen = { actions.openTask(habit.taskId) }
                    )
                }
                // the one trailing affordance
                Text(
                    "···",
                    style = abSans(skin, 11.5.sp),
                    color = if (habitsEditing) skin.palette.accent else skin.palette.inkMuted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(99.dp))
                        .border(
                            1.dp,
                            if (habitsEditing) skin.palette.accent else skin.palette.hairline,
                            RoundedCornerShape(99.dp)
                        )
                        .clickable { habitsEditing = !habitsEditing }
                        .padding(horizontal = 11.dp, vertical = 5.dp)
                )
            }
        }

        // burn list
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
            Text("BURN LIST", style = abLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text("${view.gauges.listMinutes} MIN", style = abNum(skin, 12.sp), color = skin.palette.inkMuted)
        }
        Spacer(Modifier.height(6.dp))
        if (view.entries.isEmpty()) {
            Text(
                "NOTHING ON THE BURN LIST — PULL FROM THE TRAY OR TYPE BELOW",
                style = abLabel(skin), color = skin.palette.inkFaint,
                modifier = Modifier.padding(vertical = 10.dp)
            )
        }
        val drag = rememberVariantDragState(view.entries.map { it.taskId }, actions::reorder)
        val firstUntickedId = view.entries.firstOrNull { !it.completedToday }?.taskId
        for (entry in view.entries) {
            Box(Modifier.fillMaxWidth().variantDragRow(drag, entry.taskId)) {
                Column {
                    VariantDismissibleRow(
                        anyDragging = drag.anyDragging,
                        onRemove = { actions.removeFromList(entry.taskId) },
                        dismissHint = skin.palette.inkFaint,
                        dismissHintStyle = abNum(skin, 16.sp)
                    ) {
                        AbListRow(
                            entry = entry,
                            skin = skin,
                            pillarIndex = pillarIndexFor(entry.folderPath, view.gauges.balance),
                            isLive = ui.activeTimer?.taskId == entry.taskId,
                            showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                            isEnriching = entry.taskId in ui.enrichingTaskIds,
                            actions = actions,
                            drag = drag
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
        AbInlineAdd(skin = skin, onCapture = actions::instantCapture)

        // tray bar with the gradient + block
        Spacer(Modifier.height(12.dp))
        AbTrayBar(ui = ui, skin = skin, actions = actions)
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun AbPowerHero(ui: UiState, skin: Ex3Skin, onTap: () -> Unit) {
    val gauges = ui.view?.gauges ?: return
    val overfull = gauges.listMinutes > gauges.capacityMinutes
    val frac = when {
        gauges.capacityMinutes > 0 -> (gauges.listMinutes.toFloat() / gauges.capacityMinutes).coerceIn(0f, 1f)
        gauges.listMinutes > 0 -> 1f
        else -> 0f
    }
    val pct = if (gauges.capacityMinutes > 0) (100f * gauges.listMinutes / gauges.capacityMinutes).roundToInt()
    else if (gauges.listMinutes > 0) 100 else 0
    val shape = RoundedCornerShape(skin.shape.radiusLarge)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(skin.palette.surface)
            .border(skin.shape.borderWidth, skin.palette.hairline, shape)
            .clickable(onClick = onTap)
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Text("POWER COMMITTED", style = abLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text(
                "$pct%", style = abNum(skin, 15.sp),
                color = if (overfull) skin.palette.accentSoft else skin.palette.accent
            )
        }
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(abGradText(skin, formatClock(gauges.listMinutes)), style = abNum(skin, 54.sp).copy(lineHeight = 52.sp))
            Text(
                "/ ${formatClock(gauges.capacityMinutes)}",
                style = abNum(skin, 22.sp, FontWeight.Medium), color = skin.palette.inkMuted,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }
        Spacer(Modifier.height(10.dp))
        AbPowerCells(skin = skin, frac = frac)

        // per-pillar mini strip: lit segments by minutes, the open remainder as a dim track
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            gauges.balance.forEachIndexed { i, pillar ->
                if (pillar.minutes <= 0) return@forEachIndexed
                Box(
                    Modifier
                        .weight(pillar.minutes.toFloat())
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(skin.palette.pillarTones[i % skin.palette.pillarTones.size])
                )
            }
            val open = max(0, gauges.capacityMinutes - gauges.listMinutes)
            if (open > 0) {
                Box(
                    Modifier
                        .weight(open.toFloat())
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color.White.copy(alpha = 0.08f))
                )
            }
        }
    }
}

// 14 skewed power cells; the lit run shares ONE gradient across the full width so the heat ramps
// cell to cell (the mockup's background-position trick).
@Composable
private fun AbPowerCells(skin: Ex3Skin, frac: Float, total: Int = 14) {
    val filled = (frac * total).roundToInt().coerceIn(0, total)
    val grad = abGradient(skin)
    Canvas(Modifier.fillMaxWidth().height(16.dp)) {
        val gap = 4.dp.toPx()
        val skew = (size.height * tan(Math.toRadians(12.0))).toFloat()
        val cellW = (size.width - gap * (total - 1) - skew) / total
        val brush = Brush.horizontalGradient(grad, startX = 0f, endX = size.width)
        for (i in 0 until total) {
            val x = i * (cellW + gap)
            val path = Path().apply {
                moveTo(x + skew, 0f)
                lineTo(x + skew + cellW, 0f)
                lineTo(x + cellW, size.height)
                lineTo(x, size.height)
                close()
            }
            if (i < filled) drawPath(path, brush)
            else drawPath(path, Color.White.copy(alpha = 0.07f))
        }
    }
}

// Pill chip: hold floods it with the gradient; ticked chips stay gradient-filled. Edit state:
// dashed outline, tap opens the TaskSheet. A thin gradient baseline shows logged progress.
@Composable
private fun AbHabitChip(
    habit: DayListHabitView,
    skin: Ex3Skin,
    editing: Boolean,
    onTick: () -> Unit,
    onOpen: () -> Unit
) {
    val ticked = habit.completedToday
    val hold = rememberHoldToComplete()
    val shape = RoundedCornerShape(99.dp)
    val grad = abGradient(skin)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .clip(shape)
            .border(1.dp, if (ticked || editing) Color.Transparent else skin.palette.hairline, shape)
            .drawBehind {
                if (ticked) {
                    drawRect(Brush.horizontalGradient(grad))
                } else {
                    drawRect(Color.White.copy(alpha = 0.02f))
                    val p = hold.progress.value
                    if (p > 0f) {
                        drawRect(
                            Brush.horizontalGradient(grad, startX = 0f, endX = size.width),
                            size = size.copy(width = size.width * p),
                            alpha = 0.55f
                        )
                    }
                    // thin partial fill along the bottom edge: logged progress / effort
                    if (habit.progressMinutesToday > 0 && habit.effortMinutes > 0) {
                        val frac = (habit.progressMinutesToday.toFloat() / habit.effortMinutes).coerceIn(0f, 1f)
                        drawRect(
                            Brush.horizontalGradient(grad, startX = 0f, endX = size.width),
                            topLeft = Offset(0f, size.height - 2.dp.toPx()),
                            size = Size(size.width * frac, 2.dp.toPx())
                        )
                    }
                }
            }
            .then(
                if (editing) {
                    Modifier
                        .habitEditOutline(skin.palette.accentSoft.copy(alpha = 0.8f), 14.dp)
                        .clickable(onClick = onOpen)
                } else {
                    Modifier.holdToComplete(hold, durationMs = 450, onComplete = onTick)
                }
            )
            .padding(horizontal = 11.dp, vertical = 5.dp)
    ) {
        Text(
            habitShort(habit.title),
            style = abSans(skin, 11.5.sp),
            color = if (ticked) Color.White else skin.palette.inkMuted,
            maxLines = 2,
            modifier = Modifier.widthIn(max = 150.dp)
        )
        if (habit.streak >= 2) {
            Text(
                "${habit.streak}",
                style = abNum(skin, 11.sp),
                color = if (ticked) Color.White else skin.palette.accent
            )
        }
    }
}

// Burn-list row: card with a neon pillar bar down the left (soft glow halo behind it), LIVE
// gradient badge on the timer row, duration in the pillar tone. Hold = gradient border sweep.
@Composable
private fun AbListRow(
    entry: DayListEntryView,
    skin: Ex3Skin,
    pillarIndex: Int,
    isLive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val tone = if (pillarIndex >= 0) skin.palette.pillarTones[pillarIndex % skin.palette.pillarTones.size] else skin.palette.inkMuted
    val ticked = entry.completedToday
    val hold = rememberHoldToComplete()
    val shape = RoundedCornerShape(skin.shape.radiusSmall + 2.dp)

    Row(Modifier.fillMaxWidth().background(skin.palette.bg)) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .weight(1f)
                // bounded height so the neon bar can stretch the full card
                .height(IntrinsicSize.Min)
                .clip(shape)
                .background(skin.palette.surface)
                .border(
                    skin.shape.borderWidth,
                    if (isLive) skin.palette.accent.copy(alpha = 0.6f) else skin.palette.hairline,
                    shape
                )
                .drawBehind {
                    val p = hold.progress.value
                    if (!ticked && p > 0f) {
                        drawRect(skin.palette.accent.copy(alpha = 0.07f * p))
                        drawBorderSweep(p, skin.palette.accent, 2.dp.toPx())
                    }
                }
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(start = 9.dp, end = 12.dp, top = 8.dp, bottom = 8.dp)
        ) {
            // neon pillar bar + glow halo
            Box(
                Modifier
                    .width(3.dp)
                    .heightIn(min = 30.dp)
                    .fillMaxHeight()
                    .drawBehind {
                        val dimmed = if (ticked) 0.4f else 1f
                        drawRect(tone.copy(alpha = 0.35f * dimmed), topLeft = Offset(-2.dp.toPx(), 0f), size = Size(7.dp.toPx(), size.height))
                        drawRect(tone.copy(alpha = dimmed))
                    }
            )
            Spacer(Modifier.width(11.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    entry.title,
                    style = abSans(skin, 13.5.sp).copy(
                        textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                    ),
                    color = if (ticked) skin.palette.inkFaint else skin.palette.ink,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                Text(
                    abRowMeta(entry, isEnriching),
                    style = abLabel(skin, 8.5.sp),
                    color = if (entry.missedPin && !isEnriching) skin.palette.accentSoft else skin.palette.inkMuted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                if (entry.carryNudge && !ticked) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(
                            "SOMEDAY", style = abLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                            modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 3.dp)
                        )
                        Text(
                            "LET GO", style = abLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                            modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 3.dp)
                        )
                    }
                }
            }
            if (isLive) {
                Spacer(Modifier.width(8.dp))
                Text(
                    "LIVE ▶", style = abNum(skin, 11.sp), color = Color.White,
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .background(Brush.horizontalGradient(abGradient(skin)))
                        .padding(horizontal = 7.dp, vertical = 1.dp)
                )
            } else if (showPlay) {
                Spacer(Modifier.width(8.dp))
                Text(
                    "▶", style = abNum(skin, 13.sp), color = skin.palette.inkMuted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(3.dp))
                        .clickable { actions.startTimer(entry.taskId) }
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
            Spacer(Modifier.width(10.dp))
            // logged progress in the numeral register: "30/90m"
            val figure = if (entry.progressMinutesToday > 0 && !ticked) {
                "${entry.progressMinutesToday}/${entry.effortMinutes}m"
            } else {
                "${entry.effortMinutes}m"
            }
            Text(
                figure,
                style = abNum(skin, 17.sp),
                color = if (ticked) skin.palette.inkFaint else tone
            )
        }
        // reorder grip; a press without a drag opens the row's action menu
        VariantGripHandle(
            state = drag,
            id = entry.taskId,
            onEdit = { actions.openTask(entry.taskId) },
            onLogProgress = { actions.openTask(entry.taskId) },
            onArchive = { actions.archiveTask(entry.taskId) },
            modifier = Modifier.width(32.dp).heightIn(min = 48.dp)
        ) {
            Text("≡", style = abNum(skin, 14.sp, FontWeight.Medium), color = skin.palette.inkFaint)
        }
    }
}

private fun abRowMeta(entry: DayListEntryView, isEnriching: Boolean): String {
    if (isEnriching) return "FILING..."
    val carried = entry.carriedCount?.takeIf { it >= 1 }?.let { "↪ ${it}D · " } ?: ""
    val tag = folderLeaf(entry.folderPath)?.uppercase(Locale.UK)
    val main = when {
        entry.pinnedTime != null -> entry.pinnedTime + (tag?.let { " · $it" } ?: "")
        tag != null -> tag
        else -> "UNFILED"
    }
    return carried + main
}

@Composable
private fun AbInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val shape = RoundedCornerShape(skin.shape.radiusSmall + 2.dp)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(shape)
            .border(skin.shape.borderWidth, skin.palette.hairline, shape)
            .padding(horizontal = 12.dp)
    ) {
        Text(abGradText(skin, "+"), style = abNum(skin, 18.sp))
        Spacer(Modifier.width(10.dp))
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = abSans(skin, 13.sp, FontWeight.Normal).copy(color = skin.palette.ink),
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
                        Text("TYPE TO ADD", style = abLabel(skin), color = skin.palette.inkFaint)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier.weight(1f).padding(vertical = 12.dp)
        )
    }
}

@Composable
private fun AbTrayBar(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(skin.shape.radiusSmall + 2.dp)
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().height(42.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(shape)
                    .background(skin.palette.surface)
                    .border(skin.shape.borderWidth, skin.palette.hairline, shape)
                    .clickable { expanded = !expanded }
                    .padding(horizontal = 14.dp)
            ) {
                Text("TRAY", style = abLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
                Text(
                    "${suggestions.size} SUGGESTIONS ${if (expanded) "▾" else "▸"}",
                    style = abNum(skin, 13.sp), color = skin.palette.inkMuted
                )
            }
            // the gradient accent block on the tray bar
            Box(
                Modifier
                    .size(width = 46.dp, height = 42.dp)
                    .clip(shape)
                    .background(Brush.horizontalGradient(abGradient(skin)))
                    .clickable { expanded = !expanded },
                contentAlignment = Alignment.Center
            ) {
                Text("+", style = abNum(skin, 22.sp), color = Color.White)
            }
        }
        if (expanded) {
            Spacer(Modifier.height(6.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(skin.palette.surface)
                    .border(skin.shape.borderWidth, skin.palette.hairline, shape)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                for (task in suggestions) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                task.title, style = abSans(skin, 12.5.sp, FontWeight.Normal), color = skin.palette.ink,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            val notes = buildList {
                                task.pillarName?.let { add("FILLS ${it.uppercase(Locale.UK)}") }
                                if (task.fitsGap) add("FITS GAP")
                                if (task.resurfaced) add("RESURFACED")
                            }
                            if (notes.isNotEmpty()) {
                                Text(notes.joinToString(" · "), style = abLabel(skin, 8.sp), color = skin.palette.inkMuted)
                            }
                            if (task.staleQuestion) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(
                                        "SOMEDAY?", style = abLabel(skin, 8.5.sp), color = skin.palette.accentSoft,
                                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                                    )
                                    Text(
                                        "KEEP", style = abLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                                    )
                                }
                            }
                        }
                        Text("${task.effortMinutes}M", style = abNum(skin, 12.sp), color = skin.palette.inkMuted)
                        Spacer(Modifier.width(10.dp))
                        Text(
                            abGradText(skin, "ADD+"), style = abNum(skin, 12.sp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .clickable { actions.addFromTray(task.taskId) }
                                .padding(horizontal = 4.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }
    }
}

// ── BALANCE — POWER DRAW ─────────────────────────────────────────────────────────────────────────

@Composable
fun AfterburnerBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val parsedDate = runCatching { LocalDate.parse(view.date) }.getOrNull()
    val maxShare = gauges.balance.maxOfOrNull { it.share }?.takeIf { it > 0 } ?: 1.0
    val pink = skin.palette.accentSoft

    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(color = skin.palette.ink)) { append("POWER ") }
                withStyle(SpanStyle(brush = Brush.horizontalGradient(abGradient(skin)))) { append("DRAW") }
            },
            style = abNum(skin, 26.sp)
        )
        Text(
            "${(parsedDate?.format(AB_DOW) ?: view.date).uppercase(Locale.UK)}" +
                " · ${formatDuration(gauges.listMinutes).uppercase(Locale.UK)} OF ${formatDuration(gauges.capacityMinutes).uppercase(Locale.UK)}",
            style = abLabel(skin), color = skin.palette.inkMuted
        )

        // per-pillar cards: gradient-toned bars against a dim track
        Spacer(Modifier.height(14.dp))
        gauges.balance.forEachIndexed { i, pillar ->
            val tone = skin.palette.pillarTones[i % skin.palette.pillarTones.size]
            val shape = RoundedCornerShape(skin.shape.radiusLarge - 1.dp)
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(skin.palette.surface)
                    .border(skin.shape.borderWidth, skin.palette.hairline, shape)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Text(
                        pillar.name.uppercase(Locale.UK),
                        style = abSans(skin, 12.5.sp, FontWeight.Bold).copy(letterSpacing = 0.8.sp),
                        color = skin.palette.ink, modifier = Modifier.weight(1f)
                    )
                    Text(formatDuration(pillar.minutes) + " ", style = abNum(skin, 18.sp), color = tone)
                    Text("· ${(pillar.share * 100).toInt()}%", style = abNum(skin, 13.sp), color = skin.palette.inkMuted)
                }
                Spacer(Modifier.height(7.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(7.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color.White.copy(alpha = 0.06f))
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth((pillar.share / maxShare).toFloat().coerceIn(0f, 1f))
                            .height(7.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Brush.horizontalGradient(listOf(tone, tone.copy(alpha = 0.55f))))
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        // outlined zero-minutes alert for missing pillars
        for (missing in gauges.missingPillars) {
            val shape = RoundedCornerShape(skin.shape.radiusLarge - 1.dp)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .border(1.dp, pink.copy(alpha = 0.55f), shape)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Text(
                    "${missing.uppercase(Locale.UK)} — OFFLINE",
                    style = abSans(skin, 12.5.sp, FontWeight.Bold).copy(letterSpacing = 0.8.sp),
                    color = pink, modifier = Modifier.weight(1f)
                )
                Text("0 MIN", style = abNum(skin, 16.sp), color = pink)
            }
            Spacer(Modifier.height(10.dp))
        }
        Spacer(Modifier.height(4.dp))
    }
}
