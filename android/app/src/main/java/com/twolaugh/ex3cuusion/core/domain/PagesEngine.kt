package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.store.MAIN_FOLDER_ID

// T108: pure read models for the Pages surface (Keep-style grid of folder pages). Everything
// here is a pure function over AppState, like DayListEngine — no mutation, no persistence.

// --- recency ---------------------------------------------------------------------------------------

// When this folder last "happened": the max of its notes' updatedAt and its tasks'
// completedAt/lastCompletedAt. ISO instants compare lexicographically, so plain string max
// works. Null = nothing has ever happened here (sorts to the back of the grid).
fun folderRecency(state: AppState, folderId: String): String? {
    val docStamps = state.documents.asSequence().filter { it.folderId == folderId }.map { it.updatedAt }
    val taskStamps = state.tasks.asSequence()
        .filter { it.folderId == folderId }
        .flatMap { sequenceOf(it.completedAt, it.lastCompletedAt) }
        .filterNotNull()
    return (docStamps + taskStamps).maxOrNull()
}

// --- read models -----------------------------------------------------------------------------------

data class FolderCardView(
    val folderId: String,
    val name: String,
    // Palette index 0..7 (unset folders render tone 0).
    val colorIndex: Int,
    val isMain: Boolean,
    // Newest note, for the card preview: title line (if any) + body excerpt.
    val previewTitle: String? = null,
    val previewBody: String? = null,
    val noteCount: Int,
    val activeTaskCount: Int
)

data class NoteView(
    val id: String,
    val title: String?,
    val body: String,
    val updatedAt: String
)

data class FolderTaskRow(
    val taskId: String,
    val title: String,
    val effortMinutes: Int
)

data class FolderPageView(
    val folderId: String,
    val name: String,
    val colorIndex: Int,
    val isMain: Boolean,
    // Newest-first.
    val notes: List<NoteView>,
    val tasks: List<FolderTaskRow>
)

data class PagesView(
    val cards: List<FolderCardView> = emptyList(),
    val pages: Map<String, FolderPageView> = emptyMap()
)

// --- builders --------------------------------------------------------------------------------------

private fun clampColor(color: Int?): Int = (color ?: 0).coerceIn(0, 7)

// The grid: Main pinned first, the rest by folderRecency desc (never-touched pages last, by
// name); archived folders hidden. Child folders are pages too — the grid is flat, like Keep.
fun buildPagesView(state: AppState): PagesView {
    val visible = state.folders.filter { it.status != FolderStatus.Archived }
    val docsByFolder = state.documents.groupBy { it.folderId }
    val activeTasksByFolder = state.tasks
        .filter { it.status == TaskStatus.Active && it.folderId != null }
        .groupBy { it.folderId!! }

    val cards = visible
        .sortedWith(
            compareByDescending<com.twolaugh.ex3cuusion.core.model.Folder> { it.id == MAIN_FOLDER_ID }
                .thenByDescending { folderRecency(state, it.id) ?: "" }
                .thenBy { it.name.lowercase() }
        )
        .map { folder ->
            val notes = docsByFolder[folder.id].orEmpty()
            val newest = notes.maxByOrNull { it.updatedAt }
            FolderCardView(
                folderId = folder.id,
                name = folder.name,
                colorIndex = clampColor(folder.color),
                isMain = folder.id == MAIN_FOLDER_ID,
                previewTitle = newest?.title,
                previewBody = newest?.body?.trim()?.takeIf { it.isNotEmpty() },
                noteCount = notes.size,
                activeTaskCount = activeTasksByFolder[folder.id].orEmpty().size
            )
        }

    val pages = visible.associate { folder ->
        folder.id to FolderPageView(
            folderId = folder.id,
            name = folder.name,
            colorIndex = clampColor(folder.color),
            isMain = folder.id == MAIN_FOLDER_ID,
            notes = docsByFolder[folder.id].orEmpty()
                .sortedByDescending { it.updatedAt }
                .map { NoteView(id = it.id, title = it.title, body = it.body, updatedAt = it.updatedAt) },
            tasks = activeTasksByFolder[folder.id].orEmpty()
                .map { FolderTaskRow(taskId = it.id, title = it.title, effortMinutes = it.effortMinutes) }
        )
    }

    return PagesView(cards = cards, pages = pages)
}
