package com.twolaugh.ex3cuusion.ui.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twolaugh.ex3cuusion.core.domain.FolderPageView
import com.twolaugh.ex3cuusion.core.domain.NoteView
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin
import com.twolaugh.ex3cuusion.ui.today.SectionLabel
import com.twolaugh.ex3cuusion.ui.today.formatDuration

// T108: one folder's page — its notes (newest first), a quiet glance at its active tasks, the
// 8 colour dots, and the new-note affordance. Renders under EVERY skin, so all ink/hairline
// tokens come from LocalSkin (the folder tones themselves stay the static index-stable list).
@Composable
internal fun FolderPageScreen(
    page: FolderPageView,
    onBack: () -> Unit,
    onSetColor: (Int) -> Unit,
    onOpenNote: (String) -> Unit,
    onNewNote: () -> Unit
) {
    val palette = LocalSkin.current.palette
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back to pages",
                    tint = palette.inkMuted
                )
            }
            Text(
                text = page.name,
                style = MaterialTheme.typography.titleLarge,
                color = palette.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(Modifier.height(8.dp))
        ColorDotsRow(selected = page.colorIndex, onSelect = onSetColor)

        Spacer(Modifier.height(16.dp))
        NewNoteRow(onNewNote = onNewNote)
        HorizontalDivider(thickness = 0.5.dp, color = palette.hairline)

        for (note in page.notes) {
            NoteRow(note = note, onClick = { onOpenNote(note.id) })
            HorizontalDivider(thickness = 0.5.dp, color = palette.hairline)
        }
        if (page.notes.isEmpty()) {
            Text(
                text = "No notes here yet.",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkFaint,
                modifier = Modifier.padding(vertical = 16.dp)
            )
        }

        if (page.tasks.isNotEmpty()) {
            Spacer(Modifier.height(28.dp))
            SectionLabel("TASKS")
            Spacer(Modifier.height(4.dp))
            for (task in page.tasks) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                ) {
                    Text(
                        text = task.title,
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.inkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = formatDuration(task.effortMinutes),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.inkFaint,
                        modifier = Modifier.padding(start = 12.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(40.dp))
    }
}

// The 8 page tones as tap dots; the current tone wears a quiet ring. Each dot sits in a
// 44x44dp cell so eight of them still fit a narrow phone with honest touch targets.
@Composable
private fun ColorDotsRow(selected: Int, onSelect: (Int) -> Unit) {
    val palette = LocalSkin.current.palette
    Row(Modifier.fillMaxWidth()) {
        for (index in Ex3Colors.pageTones.indices) {
            val tone = pageTone(index)
            val isSelected = index == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(44.dp)
                    .clip(CircleShape)
                    .clickable(onClick = { onSelect(index) }),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(if (isSelected) 22.dp else 18.dp)
                        .clip(CircleShape)
                        .background(tone)
                        .then(
                            if (isSelected) Modifier.border(1.5.dp, palette.ink.copy(alpha = 0.7f), CircleShape)
                            else Modifier
                        )
                )
            }
        }
    }
}

@Composable
private fun NewNoteRow(onNewNote: () -> Unit) {
    val palette = LocalSkin.current.palette
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onNewNote)
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            Text(text = "+", style = MaterialTheme.typography.bodyLarge, color = palette.inkFaint)
        }
        Text(
            text = "new note",
            style = MaterialTheme.typography.bodyLarge,
            color = palette.inkFaint
        )
    }
}

@Composable
private fun NoteRow(note: NoteView, onClick: () -> Unit) {
    val palette = LocalSkin.current.palette
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp)
    ) {
        if (note.title != null) {
            Text(
                text = note.title,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = palette.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(4.dp))
        }
        if (note.body.isNotBlank()) {
            Text(
                text = note.body.trim(),
                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp, lineHeight = 22.sp),
                color = if (note.title != null) palette.inkMuted else palette.ink,
                maxLines = 6,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
