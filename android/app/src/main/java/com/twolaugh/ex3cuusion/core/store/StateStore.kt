package com.twolaugh.ex3cuusion.core.store

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.FolderStatus
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

// One Json config for everything that touches the shared AppState document:
// - ignoreUnknownKeys: a newer web build may add fields; the phone must not choke on them.
// - encodeDefaults=false + explicitNulls=false: absent optionals stay absent, like the TS
//   JSON.stringify output (undefined fields are simply not written).
val stateJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
    explicitNulls = false
}

// Loads/saves the single AppState JSON document, mirroring the web's FileAppStateRepository.
// The directory is injectable: app filesDir in prod, a temp dir in tests.
class StateStore(
    private val directory: File,
    private val json: Json = stateJson
) {
    val stateFile: File = File(directory, "state.json")

    fun load(): AppState? {
        if (!stateFile.exists()) return null
        return normalizeState(json.decodeFromString<AppState>(stateFile.readText()))
    }

    fun save(state: AppState): AppState {
        val normalized = normalizeState(state)
        directory.mkdirs()
        // Atomic write: serialize to a sibling temp file, then rename over the target so a crash
        // mid-write can never leave a truncated state.json.
        val temp = File(directory, "state.json.tmp")
        temp.writeText(json.encodeToString(AppState.serializer(), normalized))
        try {
            Files.move(temp.toPath(), stateFile.toPath(), StandardCopyOption.ATOMIC_MOVE)
        } catch (_: IOException) {
            // Some filesystems refuse ATOMIC_MOVE onto an existing file; plain replace is still
            // a single rename on both Android and NTFS.
            Files.move(temp.toPath(), stateFile.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
        return normalized
    }
}

// T108: the well-known quick-capture inbox page. Every normalized state has it; dangling
// documents reparent into it rather than disappearing.
const val MAIN_FOLDER_ID = "folder_main"

internal fun mainFolder(): Folder =
    Folder(id = MAIN_FOLDER_ID, name = "Main", color = 0, status = FolderStatus.Active)

// Port of normalizeState's NORMALIZATION layer (repository.ts). The legacy domains/projects/
// routines forward-migration is intentionally NOT ported: the phone never sees pre-T088 data.
// Missing-array defaulting (the `??=` lines) is handled structurally by the @Serializable
// defaults on AppState/CaptureSession, so only the folder-tree repairs remain.
fun normalizeState(state: AppState): AppState {
    val base = state.folders.ifEmpty {
        listOf(Folder(id = "folder_personal", name = "Personal", weight = 5, status = FolderStatus.Active))
    }
    // T108: the Main page (quick-capture inbox) always exists — top-level, colour 0. An existing
    // folder_main is left exactly as the user has it (renamed/recoloured is fine).
    val folders = if (base.none { it.id == MAIN_FOLDER_ID }) base + mainFolder() else base
    val folderIds = folders.mapTo(HashSet()) { it.id }

    // parentFolderId pointing at a missing folder -> cleared (folder becomes top-level).
    val repairedFolders = folders.map { folder ->
        if (folder.parentFolderId != null && folder.parentFolderId !in folderIds) folder.copy(parentFolderId = null) else folder
    }

    // task folderId pointing at no existing folder -> cleared (task becomes unfiled).
    val repairedTasks = state.tasks.map { task ->
        if (task.folderId != null && task.folderId !in folderIds) task.copy(folderId = null) else task
    }

    // T108: a document can never dangle — notes whose folder vanished reparent to Main (unlike
    // tasks, a note has no meaning without a page to live on).
    val repairedDocuments = state.documents.map { doc ->
        if (doc.folderId !in folderIds) doc.copy(folderId = MAIN_FOLDER_ID) else doc
    }

    // Drop block selections whose folder no longer exists.
    val selections = state.folderBlockSelections.filter { it.folderId in folderIds }

    return state.copy(
        folders = repairedFolders,
        tasks = repairedTasks,
        documents = repairedDocuments,
        folderBlockSelections = selections
    )
}
