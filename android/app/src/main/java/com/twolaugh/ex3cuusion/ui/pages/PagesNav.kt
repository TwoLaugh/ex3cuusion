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

// B3: the Pages tab's internal navigation — home (dump + recents) -> browse (folder tree) ->
// folder page -> note editor — still hand-rolled state like MainActivity's Settings toggle (no
// navigation framework; four destinations). The editor remembers where it came from (home or a
// folder page) so back lands where the note was opened.
private sealed interface PagesDest {
    data object Home : PagesDest
    data object Browse : PagesDest
    data class FolderPage(val folderId: String) : PagesDest
    data class Editor(val folderId: String, val noteId: String?, val back: PagesDest) : PagesDest
}

@Composable
fun PagesHost(viewModel: AppViewModel) {
    val pages by viewModel.pagesView.collectAsStateWithLifecycle()
    var dest by remember { mutableStateOf<PagesDest>(PagesDest.Home) }

    // Fresh read on entry: Today-side mutations (ticks, captures, AI filing) move recency.
    LaunchedEffect(Unit) { viewModel.refreshPages() }

    when (val d = dest) {
        is PagesDest.Home -> PagesScreen(
            dump = pages.dump,
            recents = pages.recents,
            onJot = viewModel::jotToDump,
            onOpenDump = {
                pages.dump?.let { dest = PagesDest.Editor(it.folderId, it.noteId, back = PagesDest.Home) }
            },
            onOpenNote = { note -> dest = PagesDest.Editor(note.folderId, note.noteId, back = PagesDest.Home) },
            onBrowse = { dest = PagesDest.Browse }
        )

        is PagesDest.Browse -> {
            BackHandler { dest = PagesDest.Home }
            FolderBrowseScreen(
                tree = pages.tree,
                onBack = { dest = PagesDest.Home },
                onOpenFolder = { dest = PagesDest.FolderPage(it) }
            )
        }

        is PagesDest.FolderPage -> {
            BackHandler { dest = PagesDest.Browse }
            val page = pages.pages[d.folderId]
            if (page == null) {
                // Folder vanished underneath us (undo of a create, import) — fall back quietly.
                dest = PagesDest.Browse
            } else {
                FolderPageScreen(
                    page = page,
                    onBack = { dest = PagesDest.Browse },
                    onSetColor = { viewModel.setFolderColor(d.folderId, it) },
                    onOpenNote = { dest = PagesDest.Editor(d.folderId, it, back = d) },
                    onNewNote = { dest = PagesDest.Editor(d.folderId, null, back = d) }
                )
            }
        }

        is PagesDest.Editor -> {
            val page = pages.pages[d.folderId]
            val note = d.noteId?.let { id -> page?.notes?.find { it.id == id } }
            // B3: opening an existing note bumps its transient lastViewedAt (recents ordering).
            // Telemetry, not an edit — the engine records no history for it.
            LaunchedEffect(d.noteId) { d.noteId?.let(viewModel::markNoteViewed) }
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
                    dest = d.back
                },
                onDelete = {
                    if (d.noteId != null) viewModel.deleteNote(d.noteId)
                    dest = d.back
                }
            )
        }
    }
}
