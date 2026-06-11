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

// Port of normalizeState's NORMALIZATION layer (repository.ts). The legacy domains/projects/
// routines forward-migration is intentionally NOT ported: the phone never sees pre-T088 data.
// Missing-array defaulting (the `??=` lines) is handled structurally by the @Serializable
// defaults on AppState/CaptureSession, so only the folder-tree repairs remain.
fun normalizeState(state: AppState): AppState {
    val folders = state.folders.ifEmpty {
        listOf(Folder(id = "folder_personal", name = "Personal", weight = 5, status = FolderStatus.Active))
    }
    val folderIds = folders.mapTo(HashSet()) { it.id }

    // parentFolderId pointing at a missing folder -> cleared (folder becomes top-level).
    val repairedFolders = folders.map { folder ->
        if (folder.parentFolderId != null && folder.parentFolderId !in folderIds) folder.copy(parentFolderId = null) else folder
    }

    // task folderId pointing at no existing folder -> cleared (task becomes unfiled).
    val repairedTasks = state.tasks.map { task ->
        if (task.folderId != null && task.folderId !in folderIds) task.copy(folderId = null) else task
    }

    // Drop block selections whose folder no longer exists.
    val selections = state.folderBlockSelections.filter { it.folderId in folderIds }

    return state.copy(
        folders = repairedFolders,
        tasks = repairedTasks,
        folderBlockSelections = selections
    )
}
