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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.DayListEntryView
import com.twolaugh.ex3cuusion.core.domain.DayListGauges
import com.twolaugh.ex3cuusion.core.domain.DayListHabitView
import com.twolaugh.ex3cuusion.core.domain.DayListTrayTask
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
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// T109 d3 FLIGHTDECK — instrument cluster. Gauge hero (capacity dial), SYSTEMS·HABITS numbered
// pips, FLIGHT PLAN list with duration-proportional colored blocks, tray footer bar. All data
// from ui.view (DayListView); all writes through VariantActions; all chrome tokens from
// LocalSkin (intended skin: FlightdeckSkin).

private val FD_DATE = DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)

private fun fdLabel(skin: Ex3Skin, size: TextUnit = 9.5.sp) = TextStyle(
    fontFamily = skin.type.body,
    fontSize = size,
    fontWeight = FontWeight.SemiBold,
    letterSpacing = skin.type.labelLetterSpacing
)

private fun fdMono(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.SemiBold) = TextStyle(
    fontFamily = skin.type.meta,
    fontSize = size,
    fontWeight = weight
)

private fun fdSans(skin: Ex3Skin, size: TextUnit, weight: FontWeight = FontWeight.SemiBold) = TextStyle(
    fontFamily = skin.type.body,
    fontSize = size,
    fontWeight = weight
)

@Composable
fun FlightdeckTodayBody(ui: UiState, actions: VariantActions, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val doneCount = view.entries.count { it.completedToday }

    // Horizontal gutter comes in via `modifier` from VariantTodayBody (TodayVariant.bodyGutter).
    Column(modifier.fillMaxWidth()) {
        Spacer(Modifier.height(8.dp))

        // header strip: TODAY / THU 11 JUN + sub-label, warn chip when a pillar is missing
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                val date = runCatching { LocalDate.parse(view.date).format(FD_DATE) }
                    .getOrDefault(view.date).uppercase(Locale.UK)
                Row {
                    Text("TODAY ", style = fdMono(skin, 16.sp), color = skin.palette.ink)
                    Text("/ $date", style = fdMono(skin, 16.sp), color = skin.palette.inkMuted)
                }
                Text(
                    "YOUR LIST · $doneCount OF ${view.entries.size} DONE",
                    style = fdLabel(skin), color = skin.palette.inkMuted
                )
            }
            val missing = view.gauges.missingPillars.firstOrNull()
            if (missing != null) {
                Box(
                    Modifier
                        .border(skin.shape.borderWidth, skin.palette.missed, RoundedCornerShape(skin.shape.radiusSmall))
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        "${missing.take(3).uppercase(Locale.UK)} —",
                        style = fdMono(skin, 11.sp), color = skin.palette.missed
                    )
                }
            }
        }

        Spacer(Modifier.height(6.dp))
        FdGaugeCluster(gauges = view.gauges, skin = skin, onTap = actions::openBalance)

        if (view.habits.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            FdHabitsPanel(habits = view.habits, skin = skin, onTick = actions::tick, onOpen = actions::openTask)
        }

        // flight plan
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 2.dp), verticalAlignment = Alignment.Bottom) {
            Text("FLIGHT PLAN", style = fdLabel(skin, 10.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text("BLOCKS ∝ DURATION", style = fdMono(skin, 10.sp, FontWeight.Normal), color = skin.palette.inkMuted)
        }
        Spacer(Modifier.height(5.dp))

        if (view.entries.isEmpty()) {
            Text(
                "NO ENTRIES — PULL FROM THE TRAY OR TYPE BELOW",
                style = fdLabel(skin), color = skin.palette.inkFaint,
                modifier = Modifier.padding(vertical = 12.dp)
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
                        dismissHintStyle = fdMono(skin, 16.sp)
                    ) {
                        FdPlanRow(
                            entry = entry,
                            skin = skin,
                            pillarIndex = pillarIndexFor(entry.folderPath, view.gauges.balance),
                            isNow = entry.taskId == firstUntickedId,
                            isTimerActive = ui.activeTimer?.taskId == entry.taskId,
                            showPlay = entry.taskId == firstUntickedId && ui.activeTimer == null,
                            isEnriching = entry.taskId in ui.enrichingTaskIds,
                            actions = actions,
                            drag = drag
                        )
                    }
                    Spacer(Modifier.height(5.dp))
                }
            }
        }

        FdInlineAdd(skin = skin, onCapture = actions::instantCapture)

        Spacer(Modifier.height(12.dp))
        FdTrayFooter(ui = ui, skin = skin, actions = actions)
        Spacer(Modifier.height(16.dp))
    }
}

// ── gauge cluster: dial + LOAD% + mini pillar bars ───────────────────────────────────────────────

@Composable
private fun FdGaugeCluster(gauges: DayListGauges, skin: Ex3Skin, onTap: () -> Unit) {
    val overfull = gauges.listMinutes > gauges.capacityMinutes
    val loadPct = if (gauges.capacityMinutes > 0) {
        (100f * gauges.listMinutes / gauges.capacityMinutes).toInt()
    } else if (gauges.listMinutes > 0) 100 else 0

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(skin.shape.radiusLarge))
            .background(skin.palette.surface)
            .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
            .clickable(onClick = onTap)
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        FdDial(
            listMinutes = gauges.listMinutes,
            capacityMinutes = gauges.capacityMinutes,
            skin = skin,
            modifier = Modifier.weight(1.4f).height(112.dp)
        )
        Spacer(Modifier.width(6.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Column {
                Text("LOAD", style = fdLabel(skin), color = skin.palette.inkMuted)
                Text(
                    "$loadPct%",
                    style = fdMono(skin, 20.sp),
                    color = if (overfull) skin.palette.missed else skin.palette.accent
                )
            }
            Column {
                Text("AREAS", style = fdLabel(skin), color = skin.palette.inkMuted)
                Spacer(Modifier.height(3.dp))
                // Day-shape paired ticks: per pillar, the faint INTENT tick beside the solid
                // ACTUAL tick (one shared minute scale, so pairs compare across pillars).
                val deviations = gauges.deviations
                val maxRef = max(1, deviations.maxOfOrNull { max(it.actualMinutes, it.intentMinutes) } ?: 1)
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.height(26.dp)) {
                    for (deviation in deviations) {
                        val toneIdx = dayShapeToneIndex(deviation.folderId, deviations, gauges.balance)
                        val tone = if (toneIdx >= 0) skin.palette.pillarTones[toneIdx % skin.palette.pillarTones.size] else skin.palette.inkMuted
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                            Box(
                                Modifier
                                    .width(4.dp)
                                    .height((26 * max(0.1f, deviation.intentMinutes.toFloat() / maxRef)).dp)
                                    .background(tone.copy(alpha = 0.3f))
                            )
                            Box(
                                Modifier
                                    .width(4.dp)
                                    .height((26 * max(0.1f, deviation.actualMinutes.toFloat() / maxRef)).dp)
                                    .background(tone)
                            )
                        }
                    }
                }
            }
        }
    }
}

// 180° arc gauge: edge track, accent planned arc, dashed reserve zone, ticks (top two red),
// a needle at the load fraction, "3:55 / OF 4:41 CAP" centred under the hub.
@Composable
private fun FdDial(listMinutes: Int, capacityMinutes: Int, skin: Ex3Skin, modifier: Modifier = Modifier) {
    val track = skin.palette.hairline
    val accent = skin.palette.accent
    val mute = skin.palette.inkMuted
    val ink = skin.palette.ink
    val overfull = listMinutes > capacityMinutes
    val frac = when {
        capacityMinutes > 0 -> (listMinutes.toFloat() / capacityMinutes).coerceIn(0f, 1f)
        listMinutes > 0 -> 1f
        else -> 0f
    }
    Box(modifier) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val strokeW = 8.dp.toPx()
            val cy = size.height - 6.dp.toPx()
            val cx = size.width / 2f
            val r = min(size.width / 2f, size.height) - strokeW
            val arcTopLeft = Offset(cx - r, cy - r)
            val arcSize = Size(2 * r, 2 * r)
            // track
            drawArc(track, 180f, 180f, false, topLeft = arcTopLeft, size = arcSize, style = Stroke(strokeW))
            // planned
            drawArc(accent, 180f, 180f * frac, false, topLeft = arcTopLeft, size = arcSize, style = Stroke(strokeW))
            // dashed reserve zone (last 10%)
            drawArc(
                accent.copy(alpha = 0.35f), 342f, 18f, false, topLeft = arcTopLeft, size = arcSize,
                style = Stroke(strokeW, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 3.dp.toPx())))
            )
            // ticks — top two red, every fifth heavier
            for (i in 0..10) {
                val a = Math.PI * (1.0 + i / 10.0)
                val r0 = r - 14.dp.toPx()
                val r1 = r - (if (i % 5 == 0) 22.dp.toPx() else 18.dp.toPx())
                drawLine(
                    color = if (i >= 9) accent else mute,
                    start = Offset(cx + r0 * cos(a).toFloat(), cy + r0 * sin(a).toFloat()),
                    end = Offset(cx + r1 * cos(a).toFloat(), cy + r1 * sin(a).toFloat()),
                    strokeWidth = if (i % 5 == 0) 2.dp.toPx() else 1.dp.toPx()
                )
            }
            // needle: an outer pointer at the load fraction (kept off the centre figures)
            val na = Math.PI * (1.0 + frac)
            val n0 = r - 30.dp.toPx()
            val n1 = r - 12.dp.toPx()
            drawLine(
                color = if (overfull) skin.palette.missed else ink,
                start = Offset(cx + n0 * cos(na).toFloat(), cy + n0 * sin(na).toFloat()),
                end = Offset(cx + n1 * cos(na).toFloat(), cy + n1 * sin(na).toFloat()),
                strokeWidth = 2.5.dp.toPx()
            )
        }
        Column(
            Modifier.align(Alignment.BottomCenter).padding(bottom = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                formatClock(listMinutes),
                style = fdMono(skin, 30.sp),
                color = if (overfull) skin.palette.missed else ink
            )
            Text("OF ${formatClock(capacityMinutes)} CAP", style = fdMono(skin, 10.sp, FontWeight.Normal), color = mute)
        }
        Text("0%", style = fdMono(skin, 9.sp, FontWeight.Normal), color = mute, modifier = Modifier.align(Alignment.BottomStart))
        Text("100%", style = fdMono(skin, 9.sp, FontWeight.Normal), color = accent, modifier = Modifier.align(Alignment.BottomEnd))
    }
}

// ── SYSTEMS · HABITS: numbered pips, filled when ticked, hold-to-complete fill per pip ──────────

@Composable
private fun FdHabitsPanel(habits: List<DayListHabitView>, skin: Ex3Skin, onTick: (String) -> Unit, onOpen: (String) -> Unit) {
    val pending = habits.count { !it.completedToday }
    // The header "···" arms the edit state: pips gain a dashed outline; a TAP opens the sheet.
    var editing by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(skin.shape.radiusLarge))
            .background(skin.palette.surface)
            .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("SYSTEMS · HABITS", style = fdLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
            Text("$pending/${habits.size} PENDING", style = fdMono(skin, 10.sp, FontWeight.Normal), color = skin.palette.inkMuted)
            Text(
                "···",
                style = fdMono(skin, 12.sp),
                color = if (editing) skin.palette.accent else skin.palette.inkMuted,
                modifier = Modifier.clickable { editing = !editing }.padding(start = 8.dp, top = 2.dp, bottom = 2.dp)
            )
        }
        Spacer(Modifier.height(7.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
            habits.forEachIndexed { i, habit ->
                Box(Modifier.weight(1f)) {
                    FdHabitPip(
                        habit = habit, number = i + 1, skin = skin, editing = editing,
                        onTick = { onTick(habit.taskId) }, onOpen = { onOpen(habit.taskId) }
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            habits.joinToString(" · ") { habitShort(it.title).lowercase(Locale.UK) },
            style = fdSans(skin, 10.5.sp, FontWeight.Normal),
            color = skin.palette.inkMuted,
            maxLines = 1, overflow = TextOverflow.Ellipsis
        )
    }
}

// One pip = the hold-to-complete target, restyled: the pip floods with accent as the hold runs;
// ticked pips render solid accent with the number in panel colour. Edit state: dashed outline,
// tap opens the TaskSheet. A thin accent baseline shows logged progress / effort.
@Composable
private fun FdHabitPip(
    habit: DayListHabitView,
    number: Int,
    skin: Ex3Skin,
    editing: Boolean,
    onTick: () -> Unit,
    onOpen: () -> Unit
) {
    val hold = rememberHoldToComplete()
    val ticked = habit.completedToday
    val shape = RoundedCornerShape(3.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(22.dp)
            .clip(shape)
            .background(if (ticked) skin.palette.accent else Color.Transparent)
            .border(skin.shape.borderWidth, if (ticked) skin.palette.accent else skin.palette.hairline, shape)
            .drawBehind {
                val p = hold.progress.value
                if (!ticked && p > 0f) {
                    drawRect(color = skin.palette.accent.copy(alpha = 0.45f), size = size.copy(width = size.width * p))
                }
                if (!ticked && habit.progressMinutesToday > 0 && habit.effortMinutes > 0) {
                    val frac = (habit.progressMinutesToday.toFloat() / habit.effortMinutes).coerceIn(0f, 1f)
                    drawRect(
                        color = skin.palette.accent.copy(alpha = 0.75f),
                        topLeft = Offset(0f, size.height - 2.dp.toPx()),
                        size = Size(size.width * frac, 2.dp.toPx())
                    )
                }
            }
            .then(
                if (editing) {
                    Modifier
                        .habitEditOutline(skin.palette.accent.copy(alpha = 0.7f), 3.dp)
                        .clickable(onClick = onOpen)
                } else {
                    Modifier.holdToComplete(hold, durationMs = 450, onComplete = onTick)
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        Text(
            "%02d".format(number),
            style = fdMono(skin, 8.5.sp, FontWeight.Normal),
            color = if (ticked) skin.palette.onAccent else skin.palette.inkMuted,
            maxLines = 1
        )
    }
}

// ── flight plan rows: duration-proportional colored block + bordered panel ──────────────────────

@Composable
private fun FdPlanRow(
    entry: DayListEntryView,
    skin: Ex3Skin,
    pillarIndex: Int,
    isNow: Boolean,
    isTimerActive: Boolean,
    showPlay: Boolean,
    isEnriching: Boolean,
    actions: VariantActions,
    drag: VariantDragState
) {
    val tone = if (pillarIndex >= 0) skin.palette.pillarTones[pillarIndex % skin.palette.pillarTones.size] else skin.palette.inkMuted
    val ticked = entry.completedToday
    // mockup: blocks ∝ duration at 0.5px/min, min 34 — same numbers in dp, capped for sanity
    val rowHeight = max(40f, min(entry.effortMinutes * 0.5f, 120f)).dp
    val hold = rememberHoldToComplete()
    val panelShape = RoundedCornerShape(skin.shape.radiusLarge)

    Row(Modifier.fillMaxWidth().height(rowHeight).background(skin.palette.bg)) {
        // duration block, colored by pillar tone
        Box(
            Modifier
                .width(50.dp)
                .fillMaxHeight()
                .clip(RoundedCornerShape(skin.shape.radiusSmall))
                .background(tone.copy(alpha = if (ticked) 0.07f else 0.15f))
                .drawBehind { drawRect(tone.copy(alpha = if (ticked) 0.5f else 1f), size = Size(3.dp.toPx(), size.height)) },
            contentAlignment = Alignment.Center
        ) {
            Text(
                "${entry.effortMinutes}m",
                style = fdMono(skin, 11.sp),
                color = if (ticked) skin.palette.inkFaint else tone
            )
        }
        Spacer(Modifier.width(8.dp))

        // the panel = the hold zone; hold feedback is a border sweep tracing the panel edge
        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .clip(panelShape)
                .background(skin.palette.surface)
                .border(
                    skin.shape.borderWidth,
                    if (isTimerActive || isNow) skin.palette.accent else skin.palette.hairline,
                    panelShape
                )
                .drawBehind {
                    val p = hold.progress.value
                    if (!ticked && p > 0f) {
                        drawRect(color = skin.palette.accent.copy(alpha = 0.08f * p))
                    }
                    drawBorderSweep(if (ticked) 0f else p, skin.palette.accent, 2.dp.toPx())
                }
                .holdToComplete(hold, durationMs = 600, onComplete = { actions.tick(entry.taskId) })
                .padding(horizontal = 10.dp, vertical = 4.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(
                        entry.title,
                        style = fdSans(skin, 13.5.sp).copy(
                            textDecoration = if (ticked) TextDecoration.LineThrough else TextDecoration.None
                        ),
                        color = if (ticked) skin.palette.inkFaint else skin.palette.ink,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isTimerActive) {
                        Box(Modifier.clip(RoundedCornerShape(3.dp)).background(skin.palette.accent).padding(horizontal = 5.dp, vertical = 1.dp)) {
                            Text("ACTIVE ▶", style = fdMono(skin, 8.5.sp, FontWeight.Bold), color = skin.palette.onAccent)
                        }
                    } else if (showPlay) {
                        Text(
                            "▶",
                            style = fdMono(skin, 12.sp),
                            color = skin.palette.inkMuted,
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .clickable { actions.startTimer(entry.taskId) }
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
                Text(
                    text = fdRowMeta(entry, isEnriching),
                    style = fdLabel(skin, 8.5.sp),
                    color = if (entry.missedPin && !isEnriching) skin.palette.missed else skin.palette.inkMuted,
                    maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                if (entry.carryNudge && !ticked) {
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text(
                            "SOMEDAY", style = fdLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                            modifier = Modifier.clickable { actions.carriedToSomeday(entry.taskId) }.padding(vertical = 3.dp)
                        )
                        Text(
                            "LET GO", style = fdLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                            modifier = Modifier.clickable { actions.letGo(entry.taskId) }.padding(vertical = 3.dp)
                        )
                    }
                }
            }
        }

        // reorder grip; a press without a drag opens the row's action menu
        VariantGripHandle(
            state = drag,
            id = entry.taskId,
            onEdit = { actions.openTask(entry.taskId) },
            onLogProgress = { actions.openTask(entry.taskId) },
            onArchive = { actions.archiveTask(entry.taskId) },
            modifier = Modifier.width(36.dp).fillMaxHeight()
        ) {
            Text("≡", style = fdMono(skin, 14.sp, FontWeight.Normal), color = skin.palette.inkFaint)
        }
    }
}

private fun fdRowMeta(entry: DayListEntryView, isEnriching: Boolean): String {
    if (isEnriching) return "FILING..."
    val carried = entry.carriedCount?.takeIf { it >= 1 }?.let { "↪ ${it}D · " } ?: ""
    // logged progress in the instrument register: "30M/90M ·"
    val progress = if (entry.progressMinutesToday > 0 && !entry.completedToday) {
        "${entry.progressMinutesToday}M/${entry.effortMinutes}M · "
    } else {
        ""
    }
    val tag = folderLeaf(entry.folderPath)?.uppercase(Locale.UK)
    val main = when {
        entry.pinnedTime != null -> entry.pinnedTime + (tag?.let { " · $it" } ?: "")
        tag != null -> tag
        else -> "UNFILED"
    }
    return carried + progress + main
}

// ── inline add ───────────────────────────────────────────────────────────────────────────────────

@Composable
internal fun FdInlineAdd(skin: Ex3Skin, onCapture: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(skin.shape.radiusLarge))
            .border(
                skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge)
            )
            .padding(horizontal = 12.dp)
    ) {
        Text("+", style = fdMono(skin, 16.sp), color = skin.palette.accent)
        Spacer(Modifier.width(10.dp))
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = fdSans(skin, 13.5.sp, FontWeight.Normal).copy(color = skin.palette.ink),
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
                        Text("TYPE TO ADD", style = fdLabel(skin), color = skin.palette.inkFaint)
                    }
                    innerTextField()
                }
            },
            modifier = Modifier.weight(1f).padding(vertical = 12.dp)
        )
    }
}

// ── tray footer bar (expandable) ─────────────────────────────────────────────────────────────────

@Composable
private fun FdTrayFooter(ui: UiState, skin: Ex3Skin, actions: VariantActions) {
    val tray = ui.view?.tray ?: return
    val suggestions = tray.due + tray.balance + tray.backlog
    var expanded by remember { mutableStateOf(false) }
    Column {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().height(40.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(skin.shape.radiusLarge))
                    .background(skin.palette.surface)
                    .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
                    .clickable { expanded = !expanded }
                    .padding(horizontal = 12.dp)
            ) {
                Text("TRAY", style = fdLabel(skin), color = skin.palette.ink, modifier = Modifier.weight(1f))
                Text(
                    "${suggestions.size} SUGGESTIONS ${if (expanded) "▾" else "▸"}",
                    style = fdMono(skin, 11.sp, FontWeight.Normal), color = skin.palette.inkMuted
                )
            }
            Box(
                Modifier
                    .size(width = 44.dp, height = 40.dp)
                    .clip(RoundedCornerShape(skin.shape.radiusLarge))
                    .background(skin.palette.accent)
                    .clickable { expanded = !expanded },
                contentAlignment = Alignment.Center
            ) {
                Text("+", style = fdMono(skin, 20.sp), color = skin.palette.onAccent)
            }
        }
        if (expanded) {
            Spacer(Modifier.height(5.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(skin.shape.radiusLarge))
                    .background(skin.palette.surface)
                    .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                for (task in suggestions) {
                    FdTrayRow(task = task, skin = skin, actions = actions)
                }
            }
        }
    }
}

@Composable
private fun FdTrayRow(task: DayListTrayTask, skin: Ex3Skin, actions: VariantActions) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Column(Modifier.weight(1f)) {
            Text(
                task.title, style = fdSans(skin, 12.5.sp, FontWeight.Normal), color = skin.palette.ink,
                maxLines = 1, overflow = TextOverflow.Ellipsis
            )
            val notes = buildList {
                task.pillarName?.let { add("FILLS ${it.uppercase(Locale.UK)}") }
                if (task.fitsGap) add("FITS GAP")
                if (task.resurfaced) add("RESURFACED")
            }
            if (notes.isNotEmpty()) {
                Text(notes.joinToString(" · "), style = fdLabel(skin, 8.sp), color = skin.palette.inkMuted)
            }
            if (task.staleQuestion) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "SOMEDAY?", style = fdLabel(skin, 8.5.sp), color = skin.palette.missed,
                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Someday) }.padding(vertical = 2.dp)
                    )
                    Text(
                        "KEEP", style = fdLabel(skin, 8.5.sp), color = skin.palette.inkMuted,
                        modifier = Modifier.clickable { actions.resolveStale(task.taskId, StaleResolution.Keep) }.padding(vertical = 2.dp)
                    )
                }
            }
        }
        Text("${task.effortMinutes}M", style = fdMono(skin, 10.sp, FontWeight.Normal), color = skin.palette.inkMuted)
        Spacer(Modifier.width(10.dp))
        Text(
            "ADD+", style = fdMono(skin, 10.sp), color = skin.palette.accent,
            modifier = Modifier
                .clip(RoundedCornerShape(skin.shape.radiusSmall))
                .clickable { actions.addFromTray(task.taskId) }
                .padding(horizontal = 4.dp, vertical = 6.dp)
        )
    }
}

// ── BALANCE — fuel by area ───────────────────────────────────────────────────────────────────────

@Composable
fun FlightdeckBalance(ui: UiState, modifier: Modifier = Modifier) {
    val skin = LocalSkin.current
    val view = ui.view ?: return
    val gauges = view.gauges
    val openMinutes = max(0, gauges.capacityMinutes - gauges.listMinutes)

    Column(modifier.fillMaxWidth().padding(horizontal = 14.dp)) {
        val date = runCatching { LocalDate.parse(view.date).format(FD_DATE) }
            .getOrDefault(view.date).uppercase(Locale.UK)
        Row {
            Text("BALANCE ", style = fdMono(skin, 16.sp), color = skin.palette.ink)
            Text("/ $date", style = fdMono(skin, 16.sp), color = skin.palette.inkMuted)
        }
        Text(
            "${formatDuration(gauges.listMinutes).uppercase(Locale.UK)} PLANNED · ${formatDuration(gauges.capacityMinutes).uppercase(Locale.UK)} CAPACITY",
            style = fdLabel(skin), color = skin.palette.inkMuted
        )
        Spacer(Modifier.height(8.dp))

        // FUEL BY AREA: segmented (dash-filled) level bars per pillar
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(skin.shape.radiusLarge))
                .background(skin.palette.surface)
                .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Text("FUEL BY AREA", style = fdLabel(skin), color = skin.palette.ink)
            Spacer(Modifier.height(10.dp))
            // Day-shape: one shared minute scale for fills AND intent carets, so a caret past
            // its fill reads as "this tank wants more" at a glance.
            val deviationById = gauges.deviations.associateBy { it.folderId }
            val fuelMaxRef = max(
                1,
                max(
                    gauges.balance.maxOfOrNull { it.minutes } ?: 0,
                    gauges.deviations.maxOfOrNull { it.intentMinutes } ?: 0
                )
            )
            gauges.balance.forEachIndexed { i, pillar ->
                val tone = skin.palette.pillarTones[i % skin.palette.pillarTones.size]
                val intentMinutes = deviationById[pillar.folderId]?.intentMinutes
                Column(Modifier.padding(bottom = 11.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                        Text(pillar.name, style = fdSans(skin, 12.5.sp), color = skin.palette.ink, modifier = Modifier.weight(1f))
                        Text(
                            "${formatDuration(pillar.minutes)} · ${(pillar.share * 100).toInt()}%" +
                                (intentMinutes?.let { " · INT ${formatDuration(it).uppercase(Locale.UK)}" } ?: ""),
                            style = fdMono(skin, 11.sp, FontWeight.Normal), color = skin.palette.inkMuted
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(2.dp))
                            .drawBehind {
                                // segmented dash fill: 6px on / 2px off, width ∝ minutes on the shared scale
                                val fillW = size.width * (pillar.minutes.toFloat() / fuelMaxRef)
                                val seg = 6.dp.toPx()
                                val gap = 2.dp.toPx()
                                var x = 1.dp.toPx()
                                while (x < fillW) {
                                    drawRect(
                                        tone,
                                        topLeft = Offset(x, 1.dp.toPx()),
                                        size = Size(min(seg, fillW - x), size.height - 2.dp.toPx())
                                    )
                                    x += seg + gap
                                }
                                // the INTENT caret: a small notch rising from the bar floor at
                                // share × capacity, in the pillar's own tone
                                if (intentMinutes != null && intentMinutes > 0) {
                                    val cx = (size.width * (intentMinutes.toFloat() / fuelMaxRef)).coerceIn(0f, size.width - 1.dp.toPx())
                                    val path = androidx.compose.ui.graphics.Path().apply {
                                        moveTo(cx - 3.dp.toPx(), size.height)
                                        lineTo(cx + 3.dp.toPx(), size.height)
                                        lineTo(cx, size.height - 5.dp.toPx())
                                        close()
                                    }
                                    drawPath(path, tone)
                                }
                            }
                    )
                }
            }
        }

        // totals strip: PLANNED / OPEN / AREAS stat boxes
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            FdStatBox(skin, "PLANNED", formatClock(gauges.listMinutes), skin.palette.ink, Modifier.weight(1f))
            FdStatBox(skin, "OPEN", formatClock(openMinutes), skin.palette.accent, Modifier.weight(1f))
            FdStatBox(
                skin, "AREAS",
                "${gauges.balance.size}/${gauges.balance.size + gauges.missingPillars.size}",
                skin.palette.ink, Modifier.weight(1f)
            )
        }

        // hazard-striped caution when a pillar is missing
        val missing = gauges.missingPillars
        if (missing.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(skin.shape.radiusLarge))
                    .border(skin.shape.borderWidth, skin.palette.missed, RoundedCornerShape(skin.shape.radiusLarge))
            ) {
                // hazard stripes: repeating -45° bands
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .drawBehind {
                            val band = 8.dp.toPx()
                            var x = -size.height
                            while (x < size.width) {
                                drawLine(
                                    skin.palette.missed,
                                    start = Offset(x, size.height),
                                    end = Offset(x + size.height, 0f),
                                    strokeWidth = band
                                )
                                x += band * 2
                            }
                        }
                )
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Text("▲", style = fdMono(skin, 14.sp), color = skin.palette.missed)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(
                            "Nothing today from: ${missing.joinToString(", ")}",
                            style = fdSans(skin, 13.sp), color = skin.palette.missed
                        )
                        Text("SCHEDULE ONE TO CLEAR THIS CAUTION", style = fdLabel(skin, 8.5.sp), color = skin.palette.inkMuted)
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun FdStatBox(skin: Ex3Skin, label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(skin.shape.radiusLarge))
            .background(skin.palette.surface)
            .border(skin.shape.borderWidth, skin.palette.hairline, RoundedCornerShape(skin.shape.radiusLarge))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Text(label, style = fdLabel(skin), color = skin.palette.inkMuted)
        Text(value, style = fdMono(skin, 19.sp), color = valueColor)
    }
}
