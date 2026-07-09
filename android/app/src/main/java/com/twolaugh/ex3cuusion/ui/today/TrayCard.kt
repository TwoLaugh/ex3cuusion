@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.twolaugh.ex3cuusion.ui.today

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.twolaugh.ex3cuusion.core.domain.DayListTray
import com.twolaugh.ex3cuusion.core.domain.DayListTrayTask
import com.twolaugh.ex3cuusion.core.domain.StaleResolution
import com.twolaugh.ex3cuusion.ui.theme.Ex3Colors

private enum class TrayGroup(val label: String) { Due("due"), Balance("balance"), Backlog("backlog") }

// TRAY: the advisory surface below the list — due / balance / backlog suggestions, one-tap add.
// Collapsed/expanded header; defaults expanded when the list is nearly finished (unticked < 3).
@Composable
internal fun TrayCard(
    tray: DayListTray,
    untickedCount: Int,
    onAdd: (String) -> Unit,
    onResolveStale: (String, StaleResolution) -> Unit
) {
    val suggestionCount = tray.due.size + tray.balance.size + tray.backlog.size
    var expanded by rememberSaveable { mutableStateOf(untickedCount < 3) }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = Ex3Colors.surface,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .clickable { expanded = !expanded }
            ) {
                Text(
                    text = "TRAY · $suggestionCount suggestion" + if (suggestionCount == 1) "" else "s",
                    style = MaterialTheme.typography.labelMedium,
                    color = Ex3Colors.inkMuted,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = if (expanded) "—" else "+",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ex3Colors.inkFaint
                )
            }

            if (expanded) {
                val groups = listOf(
                    TrayGroup.Due to tray.due,
                    TrayGroup.Balance to tray.balance,
                    TrayGroup.Backlog to tray.backlog
                )
                for ((group, tasks) in groups) {
                    for (task in tasks) {
                        TrayRow(
                            group = group,
                            task = task,
                            onAdd = { onAdd(task.taskId) },
                            onResolveStale = { resolution -> onResolveStale(task.taskId, resolution) }
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun TrayRow(
    group: TrayGroup,
    task: DayListTrayTask,
    onAdd: () -> Unit,
    onResolveStale: (StaleResolution) -> Unit
) {
    val tagColor = when (group) {
        TrayGroup.Due -> Ex3Colors.accent
        TrayGroup.Balance -> Ex3Colors.missed
        TrayGroup.Backlog -> Ex3Colors.inkFaint
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
    ) {
        Text(
            text = group.label,
            style = MaterialTheme.typography.labelMedium,
            color = tagColor,
            modifier = Modifier.width(56.dp)
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = task.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ex3Colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false)
                )
                // T093: big-and-vague — a tiny non-functional hint for v1 (split flow arrives later).
                if (task.suggestSplit) {
                    Text(
                        text = "split?",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.inkFaint
                    )
                }
            }
            Text(
                text = buildString {
                    if (group == TrayGroup.Balance && task.pillarName != null) append("${task.pillarName} · ")
                    append("${task.effortMinutes}m")
                },
                style = MaterialTheme.typography.labelMedium,
                color = Ex3Colors.inkFaint
            )
            // T093 aging-as-a-question: ignored 5+ days -> ask, never auto-archive.
            if (task.staleQuestion) {
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        text = "still matters?",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.missed
                    )
                    Text(
                        text = "someday",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.inkMuted,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .clickable { onResolveStale(StaleResolution.Someday) }
                            .padding(vertical = 6.dp, horizontal = 2.dp)
                    )
                    Text(
                        text = "keep",
                        style = MaterialTheme.typography.labelMedium,
                        color = Ex3Colors.inkMuted,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .clickable { onResolveStale(StaleResolution.Keep) }
                            .padding(vertical = 6.dp, horizontal = 2.dp)
                    )
                }
            }
        }
        Surface(
            onClick = onAdd,
            shape = RoundedCornerShape(999.dp),
            color = Color.Transparent
        ) {
            Text(
                text = "add",
                style = MaterialTheme.typography.labelLarge,
                color = Ex3Colors.accent,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}
