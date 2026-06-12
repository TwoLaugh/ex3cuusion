package com.twolaugh.ex3cuusion.ui.pages

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin

// T108: the note editor — optional title + free body, 15sp at a 1.5 line height for long-form
// reading. No save button: leaving the screen (back arrow OR system back) commits whatever
// changed; the engine treats an unchanged save as a no-op so casual peeks leave no history.
@Composable
internal fun NoteEditorScreen(
    folderName: String,
    initialTitle: String,
    initialBody: String,
    canDelete: Boolean,
    onCommit: (title: String, body: String) -> Unit,
    onDelete: () -> Unit
) {
    val palette = LocalSkin.current.palette
    var title by remember { mutableStateOf(initialTitle) }
    var body by remember { mutableStateOf(initialBody) }
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    fun commitAndLeave() = onCommit(title, body)

    BackHandler { commitAndLeave() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
    ) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 8.dp)) {
            IconButton(onClick = { commitAndLeave() }) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Save and go back",
                    tint = palette.inkMuted
                )
            }
            Text(
                text = folderName,
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkFaint,
                modifier = Modifier.weight(1f)
            )
            if (canDelete) {
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            imageVector = Icons.Filled.MoreVert,
                            contentDescription = "Note actions",
                            tint = palette.inkMuted
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Delete note", style = MaterialTheme.typography.bodyMedium) },
                            onClick = {
                                menuOpen = false
                                confirmDelete = true
                            }
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        BasicTextField(
            value = title,
            onValueChange = { title = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.titleMedium.copy(color = palette.ink, fontWeight = FontWeight.Medium),
            cursorBrush = SolidColor(palette.accent),
            decorationBox = { innerTextField ->
                Box {
                    if (title.isEmpty()) {
                        Text(
                            text = "Title",
                            style = MaterialTheme.typography.titleMedium,
                            color = palette.inkFaint
                        )
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp)
        )

        BasicTextField(
            value = body,
            onValueChange = { body = it },
            textStyle = MaterialTheme.typography.bodyMedium.copy(
                color = palette.ink,
                fontSize = 15.sp,
                lineHeight = 22.5.sp // 15sp x 1.5
            ),
            cursorBrush = SolidColor(palette.accent),
            decorationBox = { innerTextField ->
                Box {
                    if (body.isEmpty()) {
                        Text(
                            text = "Write...",
                            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
                            color = palette.inkFaint
                        )
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 20.dp, vertical = 8.dp)
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = palette.surface,
            title = { Text("Delete this note?", style = MaterialTheme.typography.titleMedium, color = palette.ink) },
            text = {
                Text(
                    text = "It can be brought back with undo on the Today screen.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkMuted
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text("Delete", color = palette.accent) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Keep", color = palette.inkMuted) }
            }
        )
    }
}
