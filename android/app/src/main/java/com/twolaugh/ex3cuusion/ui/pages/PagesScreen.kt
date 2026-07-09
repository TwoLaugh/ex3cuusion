package com.twolaugh.ex3cuusion.ui.pages

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.DumpCardView
import com.twolaugh.ex3cuusion.core.domain.RecentNoteView
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.today.SectionLabel

// B3: the Pages tab home — jot field on top, then the DUMP note (the one persistent inbox note,
// always first, visually distinguished), then RECENT: the most recently edited/viewed notes
// across all folders, colour-coded by their folder's tone. The folder hierarchy lives on its own
// Browse page, reached through the small header icon (elegance: reuse the header, no fab).
//
// Daily-driver polish: Pages renders under EVERY skin (the tab is reachable regardless of the
// Today variant), so all ink/surface/hairline tokens come from LocalSkin — the old warm-dark
// statics painted near-white text on the light paper skins. The 8 folder tones stay the static
// index-stable list (Folder.color stores the index); they are mid-value and read on every bg.

internal fun pageTone(index: Int) = Ex3Colors.pageTones[index.coerceIn(0, Ex3Colors.pageTones.size - 1)]

@Composable
internal fun PagesScreen(
    dump: DumpCardView?,
    recents: List<RecentNoteView>,
    onJot: (String) -> Unit,
    onOpenDump: () -> Unit,
    onOpenNote: (RecentNoteView) -> Unit,
    onBrowse: () -> Unit
) {
    val palette = LocalSkin.current.palette
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Pages",
                style = MaterialTheme.typography.titleLarge,
                color = palette.ink,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onBrowse) {
                Icon(
                    imageVector = Icons.Outlined.FolderOpen,
                    contentDescription = "Browse folders",
                    tint = palette.inkMuted
                )
            }
        }

        JotToDumpRow(onJot = onJot)
        HorizontalDivider(thickness = 0.5.dp, color = palette.hairline)
        Spacer(Modifier.height(16.dp))

        LazyColumn(
            contentPadding = PaddingValues(bottom = 24.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            if (dump != null) {
                item(key = "dump") {
                    DumpCard(dump = dump, onClick = onOpenDump)
                    Spacer(Modifier.height(20.dp))
                }
            }
            item(key = "recent_label") {
                SectionLabel("RECENT")
                Spacer(Modifier.height(8.dp))
            }
            if (recents.isEmpty()) {
                item(key = "recent_empty") {
                    Text(
                        text = "Notes you edit or open show up here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.inkFaint,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }
            }
            items(recents, key = { it.noteId }) { note ->
                RecentNoteCard(note = note, onClick = { onOpenNote(note) })
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

// Borderless quick-jot: clears on done and keeps focus for rapid batch capture, exactly like the
// Today list's inline add. B3: jots APPEND to the dump note (the inbox) as timestamped lines.
@Composable
private fun JotToDumpRow(onJot: (String) -> Unit) {
    val palette = LocalSkin.current.palette
    var draft by remember { mutableStateOf("") }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            Text(text = "+", style = MaterialTheme.typography.bodyLarge, color = palette.inkFaint)
        }
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = palette.ink),
            cursorBrush = SolidColor(palette.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                val text = draft.trim()
                draft = "" // clears immediately, keeps focus: rapid batch jotting
                if (text.isNotEmpty()) onJot(text)
            }),
            decorationBox = { innerTextField ->
                Box {
                    if (draft.isEmpty()) {
                        Text(
                            text = "jot to the dump...",
                            style = MaterialTheme.typography.bodyLarge,
                            color = palette.inkFaint
                        )
                    }
                    innerTextField()
                }
            },
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 14.dp)
        )
    }
}

// The DUMP — one special always-first card: accent hairline border, larger than the recents,
// showing the TAIL of the body (the newest jots live at the bottom). Tap = straight into the
// editor.
@Composable
private fun DumpCard(dump: DumpCardView, onClick: () -> Unit) {
    val palette = LocalSkin.current.palette
    val tail = dump.body.trim().lines().filter { it.isNotBlank() }.takeLast(4)
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = palette.surface,
        border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.55f)),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 112.dp)
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Text(
                text = "Dump",
                style = MaterialTheme.typography.titleMedium,
                color = palette.ink
            )
            Spacer(Modifier.height(6.dp))
            if (tail.isEmpty()) {
                Text(
                    text = "the inbox — jot above, file later",
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.inkFaint
                )
            } else {
                for (line in tail) {
                    Text(
                        text = line,
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
                        color = palette.inkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

// One recent note: left accent bar in the folder's palette tone, title/preview, folder name.
@Composable
private fun RecentNoteCard(note: RecentNoteView, onClick: () -> Unit) {
    val palette = LocalSkin.current.palette
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = palette.surface,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(3.dp)
                    .fillMaxHeight()
                    .background(pageTone(note.colorIndex))
            )
            Column(
                Modifier
                    .weight(1f)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                if (note.title != null) {
                    Text(
                        text = note.title,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                        color = palette.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                if (note.previewBody != null) {
                    Text(
                        text = note.previewBody,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (note.title != null) palette.inkMuted else palette.ink,
                        maxLines = if (note.title != null) 1 else 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = note.folderName,
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.inkFaint
                )
            }
        }
    }
}
