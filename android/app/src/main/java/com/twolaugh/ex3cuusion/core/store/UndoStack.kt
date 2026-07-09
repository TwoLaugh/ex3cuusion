package com.twolaugh.ex3cuusion.core.store

import com.twolaugh.ex3cuusion.core.model.AppState
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

// Snapshot taken BEFORE a mutation, so the mutation is reversible (state.ts change history).
@Serializable
data class ChangeHistoryEntry(
    val id: String,
    val source: String,
    val summary: String,
    val createdAt: String,
    val snapshot: AppState
)

// Listing view without the heavy snapshot, mirroring ChangeHistoryItem in state.ts.
data class ChangeHistoryItem(
    val id: String,
    val source: String,
    val summary: String,
    val createdAt: String
)

// Port of the web's change-history design (state.ts): snapshot-before-mutate entries capped at
// 50, LIFO rewind to an entry id, write-through persisted to a sibling history.json. Persistence
// is best-effort both ways: a corrupt file means undo starts fresh, and a failed write must
// never break the mutation itself.
class UndoStack(
    private val historyFile: File,
    private val json: Json = stateJson,
    private val maxEntries: Int = MAX_CHANGE_HISTORY
) {
    private val entries: MutableList<ChangeHistoryEntry> = loadPersisted()

    val size: Int get() = entries.size

    fun record(source: String, summary: String, createdAt: String, snapshot: AppState): ChangeHistoryEntry {
        val entry = ChangeHistoryEntry(
            id = "history_${UUID.randomUUID()}",
            source = source,
            summary = summary,
            createdAt = createdAt,
            snapshot = snapshot
        )
        entries.add(entry)
        while (entries.size > maxEntries) entries.removeAt(0)
        persist()
        return entry
    }

    // Newest first, like listChangeHistory().
    fun list(): List<ChangeHistoryItem> =
        entries.map { ChangeHistoryItem(it.id, it.source, it.summary, it.createdAt) }.reversed()

    // Restore the snapshot captured before the given change (or the most recent change), undoing
    // it and every later change (LIFO rewind). Null when there is nothing to undo.
    fun undo(id: String? = null): AppState? {
        if (entries.isEmpty()) return null
        val index = if (id == null) entries.size - 1 else entries.indexOfFirst { it.id == id }
        if (index < 0) return null
        val snapshot = entries[index].snapshot
        while (entries.size > index) entries.removeAt(entries.size - 1)
        persist()
        return snapshot
    }

    fun clear() {
        entries.clear()
        persist()
    }

    private fun loadPersisted(): MutableList<ChangeHistoryEntry> = try {
        if (historyFile.exists()) {
            json.decodeFromString(ListSerializer(ChangeHistoryEntry.serializer()), historyFile.readText()).toMutableList()
        } else {
            mutableListOf()
        }
    } catch (_: Exception) {
        mutableListOf()
    }

    private fun persist() {
        try {
            historyFile.parentFile?.mkdirs()
            historyFile.writeText(json.encodeToString(ListSerializer(ChangeHistoryEntry.serializer()), entries))
        } catch (_: Exception) {
            // best-effort: failing to persist history must not break the mutation itself
        }
    }

    companion object {
        const val MAX_CHANGE_HISTORY = 50
    }
}
