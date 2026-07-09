package com.twolaugh.ex3cuusion.ui.pages

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.twolaugh.ex3cuusion.core.domain.FolderTreeRow
import com.twolaugh.ex3cuusion.ui.theme.LocalSkin

// B3: the folder HIERARCHY on its own page — an indented tree (depth from the engine's
// depth-first walk), each row opening the existing FolderPageScreen. Reached only through the
// Pages header's browse affordance; the home surface stays dump + recents.
@Composable
internal fun FolderBrowseScreen(
    tree: List<FolderTreeRow>,
    onBack: () -> Unit,
    onOpenFolder: (String) -> Unit
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
                text = "Folders",
                style = MaterialTheme.typography.titleLarge,
                color = palette.ink
            )
        }
        Spacer(Modifier.height(8.dp))

        for (row in tree) {
            FolderTreeRowItem(row = row, onClick = { onOpenFolder(row.folderId) })
        }

        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun FolderTreeRowItem(row: FolderTreeRow, onClick: () -> Unit) {
    val palette = LocalSkin.current.palette
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(start = (row.depth * 18).dp + 4.dp, end = 4.dp)
    ) {
        Box(
            Modifier
                .size(10.dp)
                .clip(CircleShape)
                // Main wears the app accent (it is the inbox, not a pillar), like the old grid.
                .background(if (row.isMain) palette.accent else pageTone(row.colorIndex))
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = row.name,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = buildString {
                append("${row.noteCount} ${if (row.noteCount == 1) "note" else "notes"}")
                if (row.activeTaskCount > 0) {
                    append(" · ${row.activeTaskCount} ${if (row.activeTaskCount == 1) "task" else "tasks"}")
                }
            },
            style = MaterialTheme.typography.labelMedium,
            color = palette.inkFaint,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}
