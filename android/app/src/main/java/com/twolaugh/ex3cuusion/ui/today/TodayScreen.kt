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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.twolaugh.ex3cuusion.core.domain.CloseoutView
import com.twolaugh.ex3cuusion.core.domain.DayListGauges
import com.twolaugh.ex3cuusion.core.domain.DayListHabitView
import com.twolaugh.ex3cuusion.core.domain.DayListPillarShare
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.core.domain.dayShapeNudge
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.theme.key
import com.twolaugh.ex3cuusion.ui.today.variants.TodayVariant
import com.twolaugh.ex3cuusion.ui.today.variants.VariantActions
import com.twolaugh.ex3cuusion.ui.today.variants.VariantBalance
import com.twolaugh.ex3cuusion.ui.today.variants.VariantTodayBody
import com.twolaugh.ex3cuusion.ui.today.variants.habitEditOutline
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

    // T109 host switch: the provided skin picks the Today layout. warm-dark (variant == null)
    // renders the existing composition untouched; every other skin renders its variant body
    // inside the SAME chrome — Scaffold, snackbars, sticky timer bar, close-out card, and the
    // scroll column with the focus-clearing empty-space tap.
    val skin = LocalSkin.current
    val variant = remember(skin) { TodayVariant.entries.firstOrNull { it.skin.key == skin.key } }

    LifecycleResumeEffect(Unit) {
        viewModel.syncClock()
        onPauseOrDispose { }
    }

    // T105: async results (enrichment applied / bad API key) surface as snackbars.
    LaunchedEffect(viewModel) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    // Balance-sheet visibility is host state for BOTH paths: warm-dark's gauge tap and a
    // variant's actions.openBalance() raise the same flag; the sheet itself differs per path.
    val showBalanceSheet = remember { mutableStateOf(false) }

    // TASK SHEET host state: which task's sheet is open (null = closed). Host-level so the one
    // sheet implementation serves warm-dark and every variant alike.
    val sheetTaskId = remember { mutableStateOf<String?>(null) }

    // The ONE wiring of a layout variant to the app: method references into the AppViewModel
    // (so instantCapture rides the same T105 enrichment pipeline), plus the host-owned balance
    // sheet. Remembered against the ViewModel so variant rows see a stable callback object.
    val actions = remember(viewModel) {
        object : VariantActions {
            override fun tick(taskId: String) = viewModel.tick(taskId)
            override fun removeFromList(taskId: String) = viewModel.removeFromList(taskId)
            override fun reorder(orderedTaskIds: List<String>) = viewModel.reorder(orderedTaskIds)
            override fun reorderHabits(orderedTaskIds: List<String>) = viewModel.reorderHabits(orderedTaskIds)
            override fun startTimer(taskId: String) = viewModel.startTimer(taskId)
            override fun instantCapture(title: String) = viewModel.instantCapture(title)
            override fun addFromTray(taskId: String) = viewModel.addFromTray(taskId)
            override fun resolveStale(taskId: String, resolution: StaleResolution) = viewModel.resolveStale(taskId, resolution)
            override fun carriedToSomeday(taskId: String) = viewModel.carriedToSomeday(taskId)
            override fun letGo(taskId: String) = viewModel.letGo(taskId)
            override fun openBalance() { showBalanceSheet.value = true }
            override fun openTask(taskId: String) { sheetTaskId.value = taskId }
            override fun archiveTask(taskId: String) = viewModel.archive(taskId)
            override fun deleteTask(taskId: String) = viewModel.deleteTask(taskId)
        }
    }

    val onUndoWithSnackbar = {
        val summary = viewModel.undo()
        if (summary != null) {
            scope.launch { snackbarHostState.showSnackbar("Undid: $summary") }
        }
        Unit
    }

    Scaffold(
        containerColor = if (variant == null) Ex3Colors.bg else skin.palette.bg,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        // Top/side insets only: the bottom is already covered by the shell's NavigationBar
        // padding (consumed there) — the default systemBars value would re-add the system nav
        // inset a second time and widen the IME void below.
        contentWindowInsets = WindowInsets.systemBars.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
    ) { padding ->
        val view = ui.view ?: return@Scaffold
        // T110 planning mode: the surface is pointed at tomorrow (ui.view already is tomorrow's
        // view; mutations route there in the ViewModel). Today-only chrome — timer bar and the
        // close-out card — hides while planning.
        val planning = ui.planningDate
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .consumeWindowInsets(padding)
                .imePadding()
        ) {
            // Slim sticky timer bar: pinned above the scrollable column so it never scrolls away.
            // Chrome stays single (ticket): variants get the same warm-dark bar.
            val timer = ui.activeTimer
            if (timer != null && planning == null) {
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
                    // Variant bodies own their horizontal padding (Bauhaus runs full-bleed bars);
                    // the warm-dark composition keeps its padding here, exactly as before.
                    .then(if (variant == null) Modifier.padding(horizontal = 20.dp) else Modifier)
            ) {
                if (variant == null) {
                    Spacer(Modifier.height(16.dp))

                    if (planning != null) {
                        PlanningHeader(
                            date = planning,
                            undoEnabled = ui.canUndo,
                            onUndo = onUndoWithSnackbar,
                            onBackToToday = viewModel::exitPlanning
                        )
                    } else {
                        TodayHeader(
                            date = view.date,
                            doneCount = view.entries.count { it.completedToday },
                            undoEnabled = ui.canUndo,
                            onUndo = onUndoWithSnackbar,
                            onCloseDay = viewModel::closeDay,
                            onPlanTomorrow = viewModel::enterPlanning,
                            onOpenSettings = onOpenSettings
                        )
                    }

                    if (planning == null && ui.closeoutVisible && ui.closeout != null) {
                        Spacer(Modifier.height(16.dp))
                        CloseoutCard(
                            closeout = ui.closeout!!,
                            onDismiss = viewModel::dismissCloseout,
                            onPlanTomorrow = viewModel::enterPlanning
                        )
                    }

                    Spacer(Modifier.height(20.dp))
                    GaugesRow(gauges = view.gauges, onBalanceTap = { showBalanceSheet.value = true })

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
                        HabitStrip(
                            habits = view.habits,
                            onToggle = viewModel::tick,
                            onReorder = viewModel::reorderHabits,
                            onOpenTask = { sheetTaskId.value = it }
                        )
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
                        onCapture = viewModel::instantCapture,
                        onOpenTask = { sheetTaskId.value = it },
                        onArchive = viewModel::archive,
                        onDelete = viewModel::deleteTask
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
                } else {
                    // Variant bodies carry their own headers but no undo/settings affordances
                    // (VariantActions deliberately excludes app chrome) — a slim host utility row
                    // keeps undo, close-day, plan-tomorrow and the way back to Settings reachable
                    // in every skin. While planning it also carries the back-to-today pill.
                    VariantUtilityRow(
                        planningDate = planning,
                        undoEnabled = ui.canUndo,
                        onUndo = onUndoWithSnackbar,
                        onCloseDay = viewModel::closeDay,
                        onPlanTomorrow = viewModel::enterPlanning,
                        onBackToToday = viewModel::exitPlanning,
                        onOpenSettings = onOpenSettings
                    )
                    if (planning == null && ui.closeoutVisible && ui.closeout != null) {
                        Box(Modifier.padding(start = 18.dp, end = 18.dp, bottom = 10.dp)) {
                            CloseoutCard(
                                closeout = ui.closeout!!,
                                onDismiss = viewModel::dismissCloseout,
                                onPlanTomorrow = viewModel::enterPlanning
                            )
                        }
                    }
                    VariantTodayBody(variant = variant, ui = ui, actions = actions)
                }
            }
        }

        if (showBalanceSheet.value) {
            if (variant == null) {
                BalanceSheet(gauges = view.gauges, onDismiss = { showBalanceSheet.value = false })
            } else {
                // Same container as warm-dark's sheet; the variant's balance composable renders
                // full-bleed inside it and brings its own padding/typography.
                androidx.compose.material3.ModalBottomSheet(
                    onDismissRequest = { showBalanceSheet.value = false },
                    containerColor = skin.palette.surface
                ) {
                    VariantBalance(variant = variant, ui = ui)
                    Spacer(Modifier.height(24.dp))
                }
            }
        }

        // The TASK SHEET — one host-level instance over every skin. Data re-derives from engine
        // state each recomposition (ui is in this scope), so the progress row updates live after
        // a log. LocalSkin here is already the active skin, so the sheet styles itself correctly.
        val openTaskId = sheetTaskId.value
        if (openTaskId != null) {
            val data = viewModel.taskSheetData(openTaskId)
            if (data != null) {
                TaskSheet(
                    data = data,
                    onSave = { patch -> viewModel.saveTask(openTaskId, patch) },
                    onLogProgress = { minutes -> viewModel.logProgress(openTaskId, minutes) },
                    onArchive = {
                        viewModel.archive(openTaskId)
                        sheetTaskId.value = null
                    },
                    onLetGo = {
                        viewModel.letGo(openTaskId)
                        sheetTaskId.value = null
                    },
                    onDelete = {
                        viewModel.deleteTask(openTaskId)
                        sheetTaskId.value = null
                    },
                    onDismiss = { sheetTaskId.value = null }
                )
            }
        }
    }
}

// T109: minimal host chrome over a variant body — undo + the overflow (close day / plan tomorrow
// / Settings), tinted from the skin so it stays legible on the light papers. T110: while planning
// the row leads with the back-to-today pill and the today-only menu items hide.
@Composable
private fun VariantUtilityRow(
    planningDate: String?,
    undoEnabled: Boolean,
    onUndo: () -> Unit,
    onCloseDay: () -> Unit,
    onPlanTomorrow: () -> Unit,
    onBackToToday: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val skin = LocalSkin.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp)
    ) {
        if (planningDate != null) {
            Box(Modifier.padding(start = 8.dp)) {
                BackToTodayPill(
                    onClick = onBackToToday,
                    container = skin.palette.accent,
                    content = skin.palette.onAccent
                )
            }
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onUndo, enabled = undoEnabled, modifier = Modifier.size(38.dp)) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Undo,
                contentDescription = "Undo last change",
                tint = if (undoEnabled) skin.palette.inkMuted else skin.palette.inkFaint.copy(alpha = 0.5f),
                modifier = Modifier.size(17.dp)
            )
        }
        var menuOpen by remember { mutableStateOf(false) }
        Box {
            IconButton(onClick = { menuOpen = true }, modifier = Modifier.size(38.dp)) {
                Icon(
                    imageVector = Icons.Filled.MoreVert,
                    contentDescription = "More actions",
                    tint = skin.palette.inkMuted,
                    modifier = Modifier.size(17.dp)
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (planningDate == null) {
                    DropdownMenuItem(
                        text = { Text("Plan tomorrow", style = MaterialTheme.typography.bodyMedium) },
                        onClick = {
                            menuOpen = false
                            onPlanTomorrow()
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Close the day", style = MaterialTheme.typography.bodyMedium) },
                        onClick = {
                            menuOpen = false
                            onCloseDay()
                        }
                    )
                }
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

// T110: the one obvious way out of planning mode — an accent pill, shared by the warm-dark
// planning header and the variant utility row (colors injected so each surface stays on-palette).
@Composable
private fun BackToTodayPill(onClick: () -> Unit, container: Color, content: Color) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = container,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).clickable(onClick = onClick)
    ) {
        Text(
            text = "← back to today",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
            color = content,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp)
        )
    }
}

// --- header ----------------------------------------------------------------------------------------

// T110: the warm-dark planning header — "Planning <weekday d month>" with the accent back pill
// front and center. Undo stays (planning edits are undoable); the today-only chrome does not.
@Composable
private fun PlanningHeader(
    date: String,
    undoEnabled: Boolean,
    onUndo: () -> Unit,
    onBackToToday: () -> Unit
) {
    Column {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = "Planning " + runCatching { LocalDate.parse(date).format(HEADER_DATE_FORMAT) }.getOrDefault(date),
                    style = MaterialTheme.typography.titleLarge,
                    color = Ex3Colors.ink
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "tomorrow's list — nothing here ticks today",
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
        }
        Spacer(Modifier.height(12.dp))
        BackToTodayPill(onClick = onBackToToday, container = Ex3Colors.accent, content = Ex3Colors.bg)
    }
}

@Composable
private fun TodayHeader(
    date: String,
    doneCount: Int,
    undoEnabled: Boolean,
    onUndo: () -> Unit,
    onCloseDay: () -> Unit,
    onPlanTomorrow: () -> Unit,
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
                    text = { Text("Plan tomorrow", style = MaterialTheme.typography.bodyMedium) },
                    onClick = {
                        menuOpen = false
                        onPlanTomorrow()
                    }
                )
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

// THE day-shape gauge (product-definition: capacity and balance are ONE idea). One bar: the
// track is the day window, the faint segments behind are the INTENT ghost (pillar weights
// normalized), the solid fill in front is the ACTUAL pillar mix. The whole gauge taps into the
// day-shape sheet; the single loose-tolerance nudge renders below when a deviation exists.
@Composable
private fun GaugesRow(gauges: DayListGauges, onBalanceTap: () -> Unit = {}) {
    val overfull = gauges.listMinutes > gauges.capacityMinutes
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(6.dp))
            .clickable(onClick = onBalanceTap)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "day shape",
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
        DayShapeBar(gauges = gauges)
        val nudge = dayShapeNudge(gauges)
        if (nudge != null) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = "${nudge.name}: ${formatDuration(nudge.actualMinutes)} of ~${formatDuration(nudge.intentMinutes)} intent",
                style = MaterialTheme.typography.labelMedium,
                color = Ex3Colors.missed
            )
        }
    }
}

// The day-shape bar itself. Construction, back to front:
//   1. track (raised) = the day window;
//   2. INTENT GHOST: pillar tones at low alpha, widths ∝ normalized weights across the FULL
//      track, hairline (bg-coloured) separators at the boundaries;
//   3. ACTUAL FILL: solid pillar tones, widths ∝ minutes/capacity, anchored left and grouped in
//      the same pillar order as the ghost (non-pillar buckets like "unfiled" append after);
//   4. overfull: the fill clamps at the track end and the overflow wraps as a thin amber stripe
//      along the top, capped at the full width.
@Composable
internal fun DayShapeBar(gauges: DayListGauges, modifier: Modifier = Modifier) {
    val intents = gauges.intentShares
    val actualById = gauges.balance.associateBy { it.folderId }
    // Actual segments in ghost order, then any actual-only buckets (e.g. unfiled).
    val orderedActual = intents.mapNotNull { actualById[it.folderId] } +
        gauges.balance.filter { share -> intents.none { it.folderId == share.folderId } }
    val totalActual = orderedActual.sumOf { it.minutes }
    androidx.compose.foundation.Canvas(
        modifier
            .fillMaxWidth()
            .height(10.dp)
            .clip(RoundedCornerShape(5.dp))
    ) {
        val w = size.width
        val h = size.height
        drawRect(Ex3Colors.raised)
        // intent ghost
        var gx = 0f
        for (intent in intents) {
            val segW = (intent.share * w).toFloat()
            drawRect(
                color = pillarTone(intent.folderId).copy(alpha = 0.22f),
                topLeft = Offset(gx, 0f),
                size = androidx.compose.ui.geometry.Size(segW, h)
            )
            gx += segW
            if (gx < w - 0.5f) {
                drawLine(Ex3Colors.bg, Offset(gx, 0f), Offset(gx, h), strokeWidth = 1.dp.toPx())
            }
        }
        // actual fill (after the day window closes, capacity is 0 — scale to the actual total so
        // the committed mix still reads instead of dividing by zero)
        val denom = if (gauges.capacityMinutes > 0) gauges.capacityMinutes else totalActual
        if (denom > 0) {
            var fx = 0f
            for (pillar in orderedActual) {
                if (pillar.minutes <= 0) continue
                val segW = pillar.minutes.toFloat() / denom * w
                val drawW = kotlin.math.min(segW, w - fx)
                if (drawW <= 0f) break
                drawRect(
                    color = pillarTone(pillar.folderId),
                    topLeft = Offset(fx, 0f),
                    size = androidx.compose.ui.geometry.Size(drawW, h)
                )
                fx += segW
            }
            // overflow stripe: the minutes past capacity wrap as a thin amber band on top
            if (gauges.capacityMinutes in 1 until totalActual) {
                val overflowW = ((totalActual - gauges.capacityMinutes).toFloat() / denom * w).coerceAtMost(w)
                drawRect(
                    color = Ex3Colors.missed,
                    topLeft = Offset(0f, 0f),
                    size = androidx.compose.ui.geometry.Size(overflowW, 3.dp.toPx())
                )
            }
        }
    }
}

// The DAY-SHAPE sheet (was the balance sheet): per-pillar actual vs intent — "2h 2m / ~1h 30m
// intent" — each row carrying a small twin-bar (intent ghost behind, actual fill in front), the
// capacity line up top. Rows follow the intent order (the same order the gauge groups segments
// in); actual-only buckets (e.g. Unfiled) append after with no intent figure.
@Composable
internal fun BalanceSheet(gauges: DayListGauges, onDismiss: () -> Unit) {
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Ex3Colors.surface
    ) {
        val actualById = gauges.balance.associateBy { it.folderId }
        // One reference scale for every twin-bar so rows compare against each other honestly.
        val maxRef = kotlin.math.max(
            1,
            kotlin.math.max(
                gauges.deviations.maxOfOrNull { kotlin.math.max(it.actualMinutes, it.intentMinutes) } ?: 0,
                gauges.balance.maxOfOrNull { it.minutes } ?: 0
            )
        )
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
            Text(
                text = "Day shape",
                style = MaterialTheme.typography.titleMedium,
                color = Ex3Colors.ink
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${formatDuration(gauges.listMinutes)} planned of ${formatDuration(gauges.capacityMinutes)} capacity",
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.inkMuted
            )
            Spacer(Modifier.height(16.dp))
            for (deviation in gauges.deviations) {
                DayShapeSheetRow(
                    name = deviation.name,
                    tone = pillarTone(deviation.folderId),
                    actualMinutes = actualById[deviation.folderId]?.minutes ?: deviation.actualMinutes,
                    intentMinutes = deviation.intentMinutes,
                    maxRef = maxRef,
                    underline = deviation.severity != com.twolaugh.ex3cuusion.core.domain.DayShapeSeverity.None
                )
            }
            // actual-only buckets (no top-level intent): unfiled work still shows its minutes
            for (pillar in gauges.balance.filter { share -> gauges.deviations.none { it.folderId == share.folderId } }) {
                DayShapeSheetRow(
                    name = pillar.name,
                    tone = pillarTone(pillar.folderId),
                    actualMinutes = pillar.minutes,
                    intentMinutes = null,
                    maxRef = maxRef,
                    underline = false
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

// One sheet row: dot + name, "2h 2m / ~1h 30m intent" figure, and the twin-bar underneath —
// intent ghost (faint tone, full intent width) with the solid actual fill drawn in front.
@Composable
private fun DayShapeSheetRow(
    name: String,
    tone: Color,
    actualMinutes: Int,
    intentMinutes: Int?,
    maxRef: Int,
    underline: Boolean
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(tone)
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                color = Ex3Colors.ink,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = if (intentMinutes != null) {
                    "${formatDuration(actualMinutes)} / ~${formatDuration(intentMinutes)} intent"
                } else {
                    formatDuration(actualMinutes)
                },
                style = MaterialTheme.typography.labelMedium,
                color = if (underline) Ex3Colors.missed else Ex3Colors.inkMuted
            )
        }
        Spacer(Modifier.height(5.dp))
        androidx.compose.foundation.Canvas(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
        ) {
            drawRect(Ex3Colors.raised)
            if (intentMinutes != null && intentMinutes > 0) {
                drawRect(
                    color = tone.copy(alpha = 0.25f),
                    size = androidx.compose.ui.geometry.Size(size.width * (intentMinutes.toFloat() / maxRef).coerceIn(0f, 1f), size.height)
                )
            }
            if (actualMinutes > 0) {
                drawRect(
                    color = tone,
                    size = androidx.compose.ui.geometry.Size(size.width * (actualMinutes.toFloat() / maxRef).coerceIn(0f, 1f), size.height)
                )
            }
        }
    }
}

@Composable
internal fun BalanceBar(shares: List<DayListPillarShare>) {
    // 2dp gaps + 5dp height + a minimum visual share: six segments must be countable at a glance.
    // Skin-aware track: the bar renders inside CloseoutCard on every skin.
    Row(
        Modifier
            .fillMaxWidth()
            .height(5.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(LocalSkin.current.palette.raised),
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
    onReorder: (List<String>) -> Unit,
    onOpenTask: (String) -> Unit = {}
) {
    // All habits visible at once; chips support BOTH gestures: hold still to complete, hold and
    // MOVE to rearrange. Chips render in committed order during a drag (reordering composition
    // mid-gesture kills the gesture coroutine, same trap as the list rows); the dragged chip
    // floats via translation and the new order commits on release.
    //
    // EDIT STATE (elegance rule: chips stay a PURE completion surface): the one trailing "..."
    // affordance arms editing — chips gain a faint dashed outline and a TAP opens the TaskSheet;
    // tapping "..." again exits. No per-chip buttons, no accidental tap actions outside editing.
    var editing by remember { mutableStateOf(false) }
    val order = habits.map { it.taskId }
    val chipBounds = remember { mutableStateMapOf<String, androidx.compose.ui.geometry.Rect>() }
    var dragChipId by remember { mutableStateOf<String?>(null) }
    var dragDelta by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    var pending by remember { mutableStateOf<List<String>?>(null) }

    // Live pending order, recomputed on every move: the dragged chip's center picks its slot
    // (slots = the chips' laid-out positions in committed order), everyone else slides to the
    // slot they'd occupy. The SAME order commits on release — what you see is what lands.
    fun recomputePending() {
        val id = dragChipId ?: return
        val from = chipBounds[id] ?: return
        val center = from.center + dragDelta
        val slots = order.filter { it in chipBounds }
        val targetSlot = slots
            .minByOrNull { (chipBounds.getValue(it).center - center).getDistanceSquared() }
            ?.let { slots.indexOf(it) } ?: return
        val mutable = order.toMutableList()
        mutable.remove(id)
        mutable.add(targetSlot.coerceAtMost(mutable.size), id)
        pending = if (mutable == order) null else mutable
    }

    // Re-key the whole strip on the committed order: after a reorder commits, every chip's
    // animation/bounds state is rebuilt from scratch — leftover drag translations from the old
    // layout can otherwise visually park chips in their previous slots (stale-strip bug,
    // 2026-06-11: data committed correctly while the screen kept the old arrangement).
    androidx.compose.runtime.key(order) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        for (habit in habits) {
            androidx.compose.runtime.key(habit.taskId) {
                val dragging = dragChipId == habit.taskId
                // Where this chip should sit right now: its slot in the pending order, expressed
                // as a translation from its committed slot (slot geometry = committed layout).
                val slotShift = if (!dragging && pending != null) {
                    val fromIdx = order.indexOf(habit.taskId)
                    val toIdx = pending!!.indexOf(habit.taskId)
                    val fromRect = chipBounds[order.getOrNull(fromIdx) ?: ""]
                    val toRect = chipBounds[order.getOrNull(toIdx) ?: ""]
                    if (fromRect != null && toRect != null) toRect.topLeft - fromRect.topLeft
                    else androidx.compose.ui.geometry.Offset.Zero
                } else androidx.compose.ui.geometry.Offset.Zero
                val animatedShift by androidx.compose.animation.core.animateOffsetAsState(
                    targetValue = slotShift,
                    animationSpec = tween(140),
                    label = "chipShift"
                )
                Box(
                    Modifier
                        .zIndex(if (dragging) 1f else 0f)
                        .graphicsLayer {
                            if (dragging) {
                                translationX = dragDelta.x
                                translationY = dragDelta.y
                                alpha = 0.85f
                            } else {
                                translationX = animatedShift.x
                                translationY = animatedShift.y
                            }
                        }
                        .onGloballyPositioned {
                            if (dragChipId == null) chipBounds[habit.taskId] = it.boundsInParent()
                        }
                ) {
                    HabitChip(
                        habit = habit,
                        editing = editing,
                        onOpen = { onOpenTask(habit.taskId) },
                        onToggle = { onToggle(habit.taskId) },
                        onDragStart = {
                            dragChipId = habit.taskId
                            dragDelta = androidx.compose.ui.geometry.Offset.Zero
                            pending = null
                        },
                        onDragBy = {
                            dragDelta += it
                            recomputePending()
                        },
                        onDragEnd = { cancelled ->
                            val next = if (cancelled) null else pending
                            dragChipId = null
                            dragDelta = androidx.compose.ui.geometry.Offset.Zero
                            pending = null
                            chipBounds.clear()
                            if (next != null) onReorder(next)
                        }
                    )
                }
            }
        }
        // The ONE trailing affordance: "..." toggles the edit state (accent-tinted while armed).
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = Color.Transparent,
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                if (editing) Ex3Colors.accent else Ex3Colors.inkFaint.copy(alpha = 0.6f)
            ),
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .clickable { editing = !editing }
        ) {
            Text(
                text = "···",
                style = MaterialTheme.typography.labelLarge,
                color = if (editing) Ex3Colors.accent else Ex3Colors.inkMuted,
                modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp)
            )
        }
    }
    }
}

// Compact display name: everything before the first long-form separator. "Seal technique —
// moisturise within 30s post-shower" reads as "Seal technique" on a chip. Chips allow ~30
// chars over up to two lines before truncating; the TaskSheet shows the full name.
private fun habitShortName(title: String): String {
    var cut = title.split(" — ", " - ", " – ").first().trim()
    if (cut.length > 30) cut = cut.split(" + ").first().trim()
    return if (cut.length > 30) cut.take(29).trimEnd() + "…" else cut
}

// A short letterspaced section label — the at-a-glance separator between zones of the screen.
// Skin-aware (Pages reuses it on every palette); warm-dark's palette mirrors Ex3Colors exactly.
@Composable
internal fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall.copy(letterSpacing = androidx.compose.ui.unit.TextUnit(1.8f, androidx.compose.ui.unit.TextUnitType.Sp)),
        color = LocalSkin.current.palette.inkFaint
    )
}

@Composable
private fun HabitChip(
    habit: DayListHabitView,
    editing: Boolean = false,
    onOpen: () -> Unit = {},
    onToggle: () -> Unit,
    onDragStart: () -> Unit = {},
    onDragBy: (androidx.compose.ui.geometry.Offset) -> Unit = {},
    onDragEnd: (Boolean) -> Unit = {}
) {
    val ticked = habit.completedToday
    // One gesture, two outcomes: hold STILL and the fill commits the tick; MOVE past slop and the
    // hold cancels into a rearrange drag. In the strip's EDIT state both are replaced by a plain
    // tap that opens the TaskSheet (cue: the dashed outline).
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
        border = if (ticked || editing) null else androidx.compose.foundation.BorderStroke(1.dp, Ex3Colors.inkFaint),
        modifier = Modifier
            // tactility: the chip squeezes as the hold fill grows, then settles on commit
            .scale(settle.value * (1f - 0.05f * hold.progress.value))
            .then(
                if (editing) {
                    Modifier
                        .habitEditOutline(Ex3Colors.accent.copy(alpha = 0.65f), 8.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .clickable(onClick = onOpen)
                } else Modifier.pointerInput(habit.taskId) {
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
            )
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
                    // Thin partial fill along the bottom edge: logged progress / effort estimate.
                    if (!ticked && habit.progressMinutesToday > 0 && habit.effortMinutes > 0) {
                        val frac = (habit.progressMinutesToday.toFloat() / habit.effortMinutes).coerceIn(0f, 1f)
                        drawRect(
                            color = Ex3Colors.accent.copy(alpha = 0.6f),
                            topLeft = Offset(0f, size.height - 2.dp.toPx()),
                            size = androidx.compose.ui.geometry.Size(size.width * frac, 2.dp.toPx())
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
                maxLines = 2,
                modifier = Modifier.widthIn(max = 150.dp),
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
private fun CloseoutCard(closeout: CloseoutView, onDismiss: () -> Unit, onPlanTomorrow: () -> Unit) {
    // Host chrome shared by warm-dark AND every variant skin — tokens come from the skin
    // (warm-dark's palette mirrors Ex3Colors, so the default skin is unchanged).
    val palette = LocalSkin.current.palette
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = palette.surface,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Day closed — ${closeout.doneCount} done",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.ink,
                    modifier = Modifier.weight(1f)
                )
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center
                ) {
                    Text(text = "×", color = palette.inkMuted, style = MaterialTheme.typography.titleMedium)
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
                        tint = palette.accent,
                        modifier = Modifier.size(13.dp)
                    )
                }
                Text(
                    text = buildString {
                        append("${closeout.habitsTicked} of ${closeout.habitsTotal} habits")
                        if (closeout.streaksKept > 0) append(" · ${closeout.streaksKept} streaks kept")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkMuted
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
                                if (intensity > 0f) palette.accent.copy(alpha = 0.18f + 0.82f * intensity)
                                else palette.raised
                            )
                            .then(
                                if (isToday) Modifier.border(1.dp, palette.ink.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
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
                    color = palette.inkMuted
                )
            }

            // T110: the evening ritual continues — a calm bordered pill into planning mode.
            Spacer(Modifier.height(14.dp))
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = Color.Transparent,
                border = androidx.compose.foundation.BorderStroke(1.dp, palette.accent.copy(alpha = 0.65f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(onClick = onPlanTomorrow)
            ) {
                Text(
                    text = "Plan tomorrow →",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = palette.accent,
                    modifier = Modifier.padding(vertical = 10.dp).fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }
}
