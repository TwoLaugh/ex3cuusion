@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.TaskPatch
import com.twolaugh.ex3cuusion.core.domain.validDate
import com.twolaugh.ex3cuusion.core.domain.validTime
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.ui.theme.Ex3Skin
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin

// The TASK SHEET — the one full editor for a task, opened from the grip-press menu on any row
// and from the habit strip's edit state (ELEGANCE OVER CHROME: no new buttons anywhere; the
// sheet enters through existing affordances only). Renders over EVERY skin: all colors and
// typography come from LocalSkin, nothing from the warm-dark constants.

// --- read model (built by AppViewModel from engine state) -------------------------------------------

data class FolderOption(val id: String, val path: String)

data class TaskSheetData(
    val taskId: String,
    val title: String,
    val folderId: String?,
    val folderPath: String?,
    val effortMinutes: Int,
    val dueDate: String?,
    val pinnedTime: String?,
    val tags: List<String>,
    val habit: Boolean,
    val repeatSummary: String,
    val streak: Int,
    val progressMinutesToday: Int,
    val folderOptions: List<FolderOption>
)

// Read-only repeat summary line ("repeats weekly · Mon Thu Sun").
fun repeatSummaryText(policy: RepeatPolicy): String = when (policy) {
    is RepeatPolicy.None -> "does not repeat"
    is RepeatPolicy.Daily -> "repeats daily"
    is RepeatPolicy.Weekly -> {
        val names = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
        val days = policy.days?.mapNotNull { names.getOrNull(it % 7) }
        if (days.isNullOrEmpty()) "repeats weekly" else "repeats weekly · ${days.joinToString(" ")}"
    }
}

// --- the shared grip-press row menu ------------------------------------------------------------------

// The DropdownMenu behind every grip press (warm-dark rows AND the six variants — "a plain
// skin-toned DropdownMenu is acceptable in all skins for v1"). Archive confirms INLINE: the
// first tap arms the item, the second commits; closing the menu disarms. Delete (the hard
// remove, below Archive) confirms via a real dialog — it is the one destructive act undo is
// the only way back from per-reference, so it gets the full stop.
@Composable
fun TaskRowMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onLogProgress: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit
) {
    val skin = LocalSkin.current
    var confirmArchive by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(expanded) { if (!expanded) confirmArchive = false }
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        containerColor = skin.palette.surface
    ) {
        DropdownMenuItem(
            text = { Text("Edit", style = MaterialTheme.typography.bodyMedium, color = skin.palette.ink) },
            onClick = { onDismiss(); onEdit() }
        )
        DropdownMenuItem(
            text = { Text("Log progress", style = MaterialTheme.typography.bodyMedium, color = skin.palette.ink) },
            onClick = { onDismiss(); onLogProgress() }
        )
        DropdownMenuItem(
            text = {
                Text(
                    if (confirmArchive) "Archive — sure?" else "Archive",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (confirmArchive) skin.palette.accent else skin.palette.ink
                )
            },
            onClick = {
                if (confirmArchive) {
                    onDismiss()
                    onArchive()
                } else {
                    confirmArchive = true
                }
            }
        )
        DropdownMenuItem(
            text = { Text("Delete", style = MaterialTheme.typography.bodyMedium, color = skin.palette.missed) },
            onClick = {
                onDismiss()
                confirmDelete = true
            }
        )
    }
    if (confirmDelete) {
        DeleteConfirmDialog(
            skin = skin,
            onConfirm = { confirmDelete = false; onDelete() },
            onCancel = { confirmDelete = false }
        )
    }
}

// The shared Delete confirm (grip-press menu AND the TaskSheet actions row use the same words).
@Composable
internal fun DeleteConfirmDialog(skin: Ex3Skin, onConfirm: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = skin.palette.surface,
        title = { Text("Delete permanently?", style = MaterialTheme.typography.titleMedium, color = skin.palette.ink) },
        text = {
            Text(
                "Archive keeps it findable.",
                style = MaterialTheme.typography.bodyMedium,
                color = skin.palette.inkMuted
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("Delete", color = skin.palette.missed) }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text("Cancel", color = skin.palette.inkMuted) }
        }
    )
}

// --- the sheet ----------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TaskSheet(
    data: TaskSheetData,
    onSave: (TaskPatch) -> Unit,
    onLogProgress: (Int) -> Unit,
    onArchive: () -> Unit,
    onLetGo: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    val skin = LocalSkin.current

    // Field state, seeded once per task (the progress row below reads LIVE data instead).
    var title by remember(data.taskId) { mutableStateOf(data.title) }
    var folderId by remember(data.taskId) { mutableStateOf(data.folderId) }
    var effortText by remember(data.taskId) { mutableStateOf(data.effortMinutes.toString()) }
    var dueText by remember(data.taskId) { mutableStateOf(data.dueDate ?: "") }
    var pinText by remember(data.taskId) { mutableStateOf(data.pinnedTime ?: "") }
    var tagsText by remember(data.taskId) { mutableStateOf(data.tags.joinToString(", ")) }
    var habitOn by remember(data.taskId) { mutableStateOf(data.habit) }
    var logText by remember(data.taskId) { mutableStateOf("") }
    var confirm by remember(data.taskId) { mutableStateOf<SheetConfirm?>(null) }

    val dueValid = dueText.trim().isEmpty() || validDate(dueText.trim())
    val pinValid = pinText.trim().isEmpty() || validTime(pinText.trim())
    val cleanedTags = tagsText.split(',').map { it.trim() }.filter { it.isNotEmpty() }

    fun buildPatch(): TaskPatch {
        val newTitle = title.trim()
        val newEffort = effortText.trim().toIntOrNull()
        val newDue = dueText.trim()
        val newPin = pinText.trim()
        return TaskPatch(
            title = newTitle.takeIf { it.isNotEmpty() && it != data.title },
            folderId = folderId.takeIf { it != data.folderId },
            effortMinutes = newEffort?.takeIf { it != data.effortMinutes },
            // "" clears; an invalid value is withheld (the field shows the error tint instead).
            dueDate = newDue.takeIf { dueValid && it != (data.dueDate ?: "") },
            scheduledTime = newPin.takeIf { pinValid && it != (data.pinnedTime ?: "") },
            habit = habitOn.takeIf { it != data.habit },
            tags = cleanedTags.takeIf { it != data.tags }
        )
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = skin.palette.surface) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 28.dp)
        ) {
            // title (full name — chips elsewhere may truncate) + the habit streak flame
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(
                    value = title,
                    onValueChange = { title = it },
                    textStyle = TextStyle(
                        fontFamily = skin.type.display,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Medium,
                        color = skin.palette.ink
                    ),
                    cursorBrush = SolidColor(skin.palette.accent),
                    modifier = Modifier.weight(1f).padding(vertical = 6.dp)
                )
                if (data.habit && data.streak >= 2) {
                    Icon(
                        imageVector = Icons.Filled.LocalFireDepartment,
                        contentDescription = "${data.streak} day streak",
                        tint = skin.palette.accent,
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(Modifier.width(3.dp))
                    Text("${data.streak}", style = sheetMeta(skin), color = skin.palette.accent)
                }
            }
            HairLine(skin)

            // folder: full-path picker over the active folders
            Spacer(Modifier.height(14.dp))
            SheetLabel(skin, "FOLDER")
            var folderMenuOpen by remember { mutableStateOf(false) }
            Box {
                Text(
                    text = data.folderOptions.firstOrNull { it.id == folderId }?.path ?: "unfiled",
                    style = sheetBody(skin),
                    color = if (folderId == null) skin.palette.inkMuted else skin.palette.ink,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(skin.shape.radiusSmall))
                        .clickable { folderMenuOpen = true }
                        .padding(vertical = 8.dp)
                )
                DropdownMenu(
                    expanded = folderMenuOpen,
                    onDismissRequest = { folderMenuOpen = false },
                    containerColor = skin.palette.surface
                ) {
                    for (option in data.folderOptions) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    option.path,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (option.id == folderId) skin.palette.accent else skin.palette.ink
                                )
                            },
                            onClick = {
                                folderId = option.id
                                folderMenuOpen = false
                            }
                        )
                    }
                }
            }
            HairLine(skin)

            // effort + due date + pinned time on one row
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                SheetField(
                    skin = skin, label = "EFFORT (MIN)", value = effortText,
                    onChange = { effortText = it }, isError = effortText.trim().toIntOrNull() == null,
                    keyboardType = KeyboardType.Number, modifier = Modifier.weight(1f)
                )
                SheetField(
                    skin = skin, label = "DUE (YYYY-MM-DD)", value = dueText,
                    onChange = { dueText = it }, isError = !dueValid,
                    placeholder = "none", modifier = Modifier.weight(1.4f)
                )
                SheetField(
                    skin = skin, label = "PINNED (HH:MM)", value = pinText,
                    onChange = { pinText = it }, isError = !pinValid,
                    placeholder = "none", modifier = Modifier.weight(1f)
                )
            }

            // tags: comma-separated field, rendered as chips when set
            Spacer(Modifier.height(14.dp))
            SheetField(
                skin = skin, label = "TAGS (COMMA-SEPARATED)", value = tagsText,
                onChange = { tagsText = it }, placeholder = "none",
                modifier = Modifier.fillMaxWidth()
            )
            if (cleanedTags.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    for (tag in cleanedTags) {
                        Text(
                            tag,
                            style = sheetMeta(skin),
                            color = skin.palette.inkMuted,
                            modifier = Modifier
                                .border(1.dp, skin.palette.inkFaint, RoundedCornerShape(99.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }

            // habit toggle + repeat summary (read-only)
            Spacer(Modifier.height(16.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(skin.shape.radiusSmall))
                    .clickable { habitOn = !habitOn }
                    .padding(vertical = 6.dp)
            ) {
                Column(Modifier.weight(1f)) {
                    Text("lives on the habit strip", style = sheetBody(skin), color = skin.palette.ink)
                    Text(data.repeatSummary, style = sheetMeta(skin), color = skin.palette.inkMuted)
                }
                SheetToggle(skin = skin, on = habitOn)
            }

            // progress: "today: Xm of Ym" + minutes field + log
            Spacer(Modifier.height(16.dp))
            SheetLabel(skin, "PROGRESS")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "today: ${data.progressMinutesToday}m of ${data.effortMinutes}m",
                    style = sheetBody(skin),
                    color = if (data.progressMinutesToday > 0) skin.palette.ink else skin.palette.inkMuted,
                    modifier = Modifier.weight(1f)
                )
                BasicTextField(
                    value = logText,
                    onValueChange = { logText = it },
                    singleLine = true,
                    textStyle = sheetBody(skin).copy(color = skin.palette.ink),
                    cursorBrush = SolidColor(skin.palette.accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (logText.isEmpty()) Text("min", style = sheetBody(skin), color = skin.palette.inkFaint)
                            inner()
                        }
                    },
                    modifier = Modifier
                        .width(56.dp)
                        .border(1.dp, skin.palette.inkFaint, RoundedCornerShape(skin.shape.radiusSmall))
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                )
                Spacer(Modifier.width(10.dp))
                val minutes = logText.trim().toIntOrNull()
                Text(
                    "log",
                    style = sheetBody(skin).copy(fontWeight = FontWeight.Medium),
                    color = if (minutes != null && minutes > 0) skin.palette.accent else skin.palette.inkFaint,
                    modifier = Modifier
                        .clip(RoundedCornerShape(skin.shape.radiusSmall))
                        .clickable(enabled = minutes != null && minutes > 0) {
                            minutes?.let(onLogProgress)
                            logText = ""
                        }
                        .padding(horizontal = 8.dp, vertical = 6.dp)
                )
            }

            // actions: archive / let go (confirmed) and save
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Archive",
                    style = sheetBody(skin),
                    color = skin.palette.inkMuted,
                    modifier = Modifier
                        .clip(RoundedCornerShape(skin.shape.radiusSmall))
                        .clickable { confirm = SheetConfirm.Archive }
                        .padding(vertical = 8.dp, horizontal = 4.dp)
                )
                Spacer(Modifier.width(18.dp))
                Text(
                    "Let go",
                    style = sheetBody(skin),
                    color = skin.palette.missed,
                    modifier = Modifier
                        .clip(RoundedCornerShape(skin.shape.radiusSmall))
                        .clickable { confirm = SheetConfirm.LetGo }
                        .padding(vertical = 8.dp, horizontal = 4.dp)
                )
                Spacer(Modifier.width(18.dp))
                Text(
                    "Delete",
                    style = sheetBody(skin),
                    color = skin.palette.missed,
                    modifier = Modifier
                        .clip(RoundedCornerShape(skin.shape.radiusSmall))
                        .clickable { confirm = SheetConfirm.Delete }
                        .padding(vertical = 8.dp, horizontal = 4.dp)
                )
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = skin.palette.accent,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .clickable {
                            onSave(buildPatch()) // only changed fields; the engine no-ops empties
                            onDismiss()
                        }
                ) {
                    Text(
                        "Save",
                        style = sheetBody(skin).copy(fontWeight = FontWeight.Medium),
                        color = skin.palette.onAccent,
                        modifier = Modifier.padding(horizontal = 22.dp, vertical = 8.dp)
                    )
                }
            }
        }
    }

    when (confirm) {
        SheetConfirm.Archive -> SheetConfirmDialog(
            skin = skin,
            title = "Archive this task?",
            body = "\"${data.title}\" leaves the rotation. Undo brings it back.",
            confirmLabel = "Archive",
            onConfirm = { confirm = null; onArchive() },
            onCancel = { confirm = null }
        )
        SheetConfirm.LetGo -> SheetConfirmDialog(
            skin = skin,
            title = "Let it go?",
            body = "\"${data.title}\" is released — guilt-free, off the list for good.",
            confirmLabel = "Let go",
            onConfirm = { confirm = null; onLetGo() },
            onCancel = { confirm = null }
        )
        // The hard remove shares the grip-press menu's exact confirm (one set of words app-wide).
        SheetConfirm.Delete -> DeleteConfirmDialog(
            skin = skin,
            onConfirm = { confirm = null; onDelete() },
            onCancel = { confirm = null }
        )
        null -> {}
    }
}

private enum class SheetConfirm { Archive, LetGo, Delete }

@Composable
private fun SheetConfirmDialog(
    skin: Ex3Skin,
    title: String,
    body: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = skin.palette.surface,
        title = { Text(title, style = MaterialTheme.typography.titleMedium, color = skin.palette.ink) },
        text = { Text(body, style = MaterialTheme.typography.bodyMedium, color = skin.palette.inkMuted) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirmLabel, color = skin.palette.accent) }
        },
        dismissButton = {
            TextButton(onClick = onCancel) { Text("Cancel", color = skin.palette.inkMuted) }
        }
    )
}

// --- small skin-driven pieces ---------------------------------------------------------------------

private fun sheetBody(skin: Ex3Skin) = TextStyle(
    fontFamily = skin.type.body,
    fontSize = 14.5.sp,
    color = skin.palette.ink
)

private fun sheetMeta(skin: Ex3Skin) = TextStyle(
    fontFamily = skin.type.meta,
    fontSize = 11.sp
)

@Composable
private fun SheetLabel(skin: Ex3Skin, text: String) {
    Text(
        text,
        style = TextStyle(
            fontFamily = skin.type.meta,
            fontSize = 9.5.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = skin.type.labelLetterSpacing
        ),
        color = skin.palette.inkFaint,
        modifier = Modifier.padding(bottom = 4.dp)
    )
}

@Composable
private fun HairLine(skin: Ex3Skin) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(skin.palette.hairline))
}

@Composable
private fun SheetField(
    skin: Ex3Skin,
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    isError: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    Column(modifier) {
        SheetLabel(skin, label)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = sheetBody(skin).copy(color = if (isError) skin.palette.missed else skin.palette.ink),
            cursorBrush = SolidColor(skin.palette.accent),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(placeholder, style = sheetBody(skin), color = skin.palette.inkFaint)
                    }
                    inner()
                }
            },
            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
        )
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(if (isError) skin.palette.missed else skin.palette.hairline)
        )
    }
}

// A quiet two-state pill (no Material Switch — its track colors fight the light skins).
@Composable
private fun SheetToggle(skin: Ex3Skin, on: Boolean) {
    Box(
        Modifier
            .size(width = 36.dp, height = 20.dp)
            .clip(RoundedCornerShape(99.dp))
            .background(if (on) skin.palette.accent else skin.palette.raised)
            .border(1.dp, if (on) skin.palette.accent else skin.palette.inkFaint, RoundedCornerShape(99.dp)),
        contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Box(
            Modifier
                .padding(horizontal = 3.dp)
                .size(14.dp)
                .clip(CircleShape)
                .background(if (on) skin.palette.onAccent else skin.palette.inkMuted)
        )
    }
}
