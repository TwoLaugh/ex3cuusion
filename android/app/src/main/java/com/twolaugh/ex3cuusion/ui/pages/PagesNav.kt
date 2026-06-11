package com.twolaugh.ex3cuusion.ui.pages

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.twolaugh.ex3cuusion.ui.today.AppViewModel

// T108: the Pages tab's internal navigation — grid -> folder page -> note editor — hand-rolled
// state like MainActivity's Settings toggle (still no navigation framework; three destinations).
private sealed interface PagesDest {
    data object Grid : PagesDest
    data class FolderPage(val folderId: String) : PagesDest
    data class Editor(val folderId: String, val noteId: String?) : PagesDest
}

@Composable
fun PagesHost(viewModel: AppViewModel) {
    val pages by viewModel.pagesView.collectAsStateWithLifecycle()
    var dest by remember { mutableStateOf<PagesDest>(PagesDest.Grid) }

    // Fresh read on entry: Today-side mutations (ticks, captures, AI filing) move recency.
    LaunchedEffect(Unit) { viewModel.refreshPages() }

    when (val d = dest) {
        is PagesDest.Grid -> PagesScreen(
            cards = pages.cards,
            onJot = viewModel::jotToMain,
            onOpenFolder = { dest = PagesDest.FolderPage(it) }
        )

        is PagesDest.FolderPage -> {
            BackHandler { dest = PagesDest.Grid }
            val page = pages.pages[d.folderId]
            if (page == null) {
                // Folder vanished underneath us (undo of a create, import) — fall back quietly.
                dest = PagesDest.Grid
            } else {
                FolderPageScreen(
                    page = page,
                    onBack = { dest = PagesDest.Grid },
                    onSetColor = { viewModel.setFolderColor(d.folderId, it) },
                    onOpenNote = { dest = PagesDest.Editor(d.folderId, it) },
                    onNewNote = { dest = PagesDest.Editor(d.folderId, null) }
                )
            }
        }

        is PagesDest.Editor -> {
            val page = pages.pages[d.folderId]
            val note = d.noteId?.let { id -> page?.notes?.find { it.id == id } }
            NoteEditorScreen(
                folderName = page?.name ?: "",
                initialTitle = note?.title.orEmpty(),
                initialBody = note?.body.orEmpty(),
                canDelete = note != null,
                // Autosave on back: a new note materializes only if something was written; an
                // unchanged existing note is a no-op inside the engine (no history entry).
                onCommit = { title, body ->
                    if (d.noteId == null) {
                        if (title.isNotBlank() || body.isNotBlank()) {
                            viewModel.createNote(d.folderId, body, title.takeIf { it.isNotBlank() })
                        }
                    } else {
                        viewModel.updateNote(d.noteId, title = title, body = body)
                    }
                    dest = PagesDest.FolderPage(d.folderId)
                },
                onDelete = {
                    if (d.noteId != null) viewModel.deleteNote(d.noteId)
                    dest = PagesDest.FolderPage(d.folderId)
                }
            )
        }
    }
}
