package com.twolaugh.ex3cuusion.ui.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
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
import com.twolaugh.ex3cuusion.core.domain.FolderCardView
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors
import com.twolaugh.ex3cuusion.ui.today.hairline

// T108: the Pages grid — every folder is a colour-coded page card, Keep-style. Main (the
// quick-capture inbox) is pinned first; the rest order by recency. The jot field at the top
// drops a note straight into Main without leaving the grid.

internal fun pageTone(index: Int) = Ex3Colors.pageTones[index.coerceIn(0, Ex3Colors.pageTones.size - 1)]

@Composable
internal fun PagesScreen(
    cards: List<FolderCardView>,
    onJot: (String) -> Unit,
    onOpenFolder: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        JotToMainRow(onJot = onJot)
        HorizontalDivider(thickness = 0.5.dp, color = hairline)
        Spacer(Modifier.height(16.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(cards, key = { it.folderId }) { card ->
                FolderCard(card = card, onClick = { onOpenFolder(card.folderId) })
            }
        }
    }
}

// Borderless quick-jot into Main: clears on done and keeps focus for rapid batch capture,
// exactly like the Today list's inline add.
@Composable
private fun JotToMainRow(onJot: (String) -> Unit) {
    var draft by remember { mutableStateOf("") }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            Text(text = "+", style = MaterialTheme.typography.bodyLarge, color = Ex3Colors.inkFaint)
        }
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Ex3Colors.ink),
            cursorBrush = SolidColor(Ex3Colors.accent),
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
                            text = "jot to Main...",
                            style = MaterialTheme.typography.bodyLarge,
                            color = Ex3Colors.inkFaint
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

@Composable
private fun FolderCard(card: FolderCardView, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = Ex3Colors.surface,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            // The colour as a subtle left accent bar — Main wears the app accent as a hairline
            // instead of a page tone (it is the inbox, not a pillar).
            Box(
                Modifier
                    .width(if (card.isMain) 2.dp else 3.dp)
                    .fillMaxHeight()
                    .background(if (card.isMain) Ex3Colors.accent else pageTone(card.colorIndex))
            )
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 96.dp)
                    .padding(horizontal = 14.dp, vertical = 12.dp)
            ) {
                Text(
                    text = card.name,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                    color = Ex3Colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (card.previewTitle != null || card.previewBody != null) {
                    Spacer(Modifier.height(6.dp))
                    if (card.previewTitle != null) {
                        Text(
                            text = card.previewTitle,
                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                            color = Ex3Colors.inkMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    if (card.previewBody != null) {
                        Text(
                            text = card.previewBody,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Ex3Colors.inkMuted,
                            maxLines = if (card.previewTitle != null) 2 else 3,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.height(8.dp))
                Text(
                    text = buildString {
                        append("${card.noteCount} ${if (card.noteCount == 1) "note" else "notes"}")
                        if (card.activeTaskCount > 0) {
                            append(" · ${card.activeTaskCount} ${if (card.activeTaskCount == 1) "task" else "tasks"}")
                        }
                    },
                    style = MaterialTheme.typography.labelMedium, // 12sp
                    color = Ex3Colors.inkFaint
                )
            }
        }
    }
}
