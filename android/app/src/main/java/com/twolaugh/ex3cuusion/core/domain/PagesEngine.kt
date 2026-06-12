package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.Document
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.store.DUMP_DOCUMENT_ID
import com.twolaugh.ex3cuusion.core.store.MAIN_FOLDER_ID

// T108/B3: pure read models for the Pages surface. B3 reshapes the tab: the DUMP note on top,
// a flat RECENT list of notes across all folders, and the folder hierarchy on its own Browse
// page. Everything here stays a pure function over AppState — no mutation, no persistence.

// The recent list is a recency surface, not an archive — everything is still reachable through
// Browse, so the flat list stays short enough to scan.
private const val RECENTS_LIMIT = 20

// --- recency ---------------------------------------------------------------------------------------

// When this folder last "happened": the max of its notes' updatedAt and its tasks'
// completedAt/lastCompletedAt. ISO instants compare lexicographically, so plain string max
// works. Null = nothing has ever happened here (sorts to the back of its sibling group).
fun folderRecency(state: AppState, folderId: String): String? {
    val docStamps = state.documents.asSequence().filter { it.folderId == folderId }.map { it.updatedAt }
    val taskStamps = state.tasks.asSequence()
        .filter { it.folderId == folderId }
        .flatMap { sequenceOf(it.completedAt, it.lastCompletedAt) }
        .filterNotNull()
    return (docStamps + taskStamps).maxOrNull()
}

// B3: when a NOTE last mattered to the user — edited or merely opened, whichever is later.
fun noteRecency(document: Document): String =
    maxOf(document.updatedAt, document.lastViewedAt ?: "")

// --- read models -----------------------------------------------------------------------------------

// B3: the always-first dump card (and the direct way into its editor).
data class DumpCardView(
    val noteId: String,
    val folderId: String,
    val body: String,
    val updatedAt: String
)

// B3: one entry in the flat RECENT list — colour-coded by its folder's palette tone.
data class RecentNoteView(
    val noteId: String,
    val folderId: String,
    val folderName: String,
    val colorIndex: Int,
    val title: String?,
    val previewBody: String?,
    // max(updatedAt, lastViewedAt) — the list's sort key, exposed for tests.
    val touchedAt: String
)

// B3: one row of the Browse screen's indented folder tree.
data class FolderTreeRow(
    val folderId: String,
    val name: String,
    val depth: Int,
    val colorIndex: Int,
    val isMain: Boolean,
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
    // Null only for a never-normalized state (normalizeState ensures the dump on every load/save).
    val dump: DumpCardView? = null,
    val recents: List<RecentNoteView> = emptyList(),
    // Depth-first indented folder tree for the Browse screen.
    val tree: List<FolderTreeRow> = emptyList(),
    val pages: Map<String, FolderPageView> = emptyMap()
)

// --- builders --------------------------------------------------------------------------------------

private fun clampColor(color: Int?): Int = (color ?: 0).coerceIn(0, 7)

fun buildPagesView(state: AppState): PagesView {
    val visible = state.folders.filter { it.status != FolderStatus.Archived }
    val folderById = visible.associateBy { it.id }
    val docsByFolder = state.documents.groupBy { it.folderId }
    val activeTasksByFolder = state.tasks
        .filter { it.status == TaskStatus.Active && it.folderId != null }
        .groupBy { it.folderId!! }

    val dump = state.documents.find { it.id == DUMP_DOCUMENT_ID }?.let {
        DumpCardView(noteId = it.id, folderId = it.folderId, body = it.body, updatedAt = it.updatedAt)
    }

    // RECENT: most recently edited/viewed notes across every folder, dump excluded (it has its
    // own pinned card). Colour comes from the note's folder tone.
    val recents = state.documents
        .filter { it.id != DUMP_DOCUMENT_ID }
        .sortedWith(compareByDescending<Document> { noteRecency(it) }.thenBy { it.id })
        .take(RECENTS_LIMIT)
        .map { doc ->
            val folder = folderById[doc.folderId]
            RecentNoteView(
                noteId = doc.id,
                folderId = doc.folderId,
                folderName = folder?.name ?: "Main",
                colorIndex = clampColor(folder?.color),
                title = doc.title,
                previewBody = doc.body.trim().takeIf { it.isNotEmpty() },
                touchedAt = noteRecency(doc)
            )
        }

    // Browse tree: depth-first walk. Main first at root, then siblings by recency desc (the old
    // grid's order), never-touched folders last by name. Folders whose parent is missing or
    // archived surface as roots so nothing becomes unreachable; the seen-set guards cycles.
    val childrenByParent = visible.groupBy { folder ->
        folder.parentFolderId?.takeIf { it in folderById } // missing/archived parent -> root
    }

    fun siblingOrder(siblings: List<Folder>): List<Folder> = siblings.sortedWith(
        compareByDescending<Folder> { it.id == MAIN_FOLDER_ID }
            .thenByDescending { folderRecency(state, it.id) ?: "" }
            .thenBy { it.name.lowercase() }
    )

    val tree = mutableListOf<FolderTreeRow>()
    val seen = mutableSetOf<String>()
    fun walk(folder: Folder, depth: Int) {
        if (!seen.add(folder.id)) return
        tree.add(
            FolderTreeRow(
                folderId = folder.id,
                name = folder.name,
                depth = depth,
                colorIndex = clampColor(folder.color),
                isMain = folder.id == MAIN_FOLDER_ID,
                noteCount = docsByFolder[folder.id].orEmpty().size,
                activeTaskCount = activeTasksByFolder[folder.id].orEmpty().size
            )
        )
        for (child in siblingOrder(childrenByParent[folder.id].orEmpty())) walk(child, depth + 1)
    }
    for (root in siblingOrder(childrenByParent[null].orEmpty())) walk(root, 0)
    // Pathological parent cycles have no root and never enter the walk — surface them flat at the
    // top level rather than silently dropping pages.
    for (orphan in siblingOrder(visible.filter { it.id !in seen })) walk(orphan, 0)

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

    return PagesView(dump = dump, recents = recents, tree = tree, pages = pages)
}
