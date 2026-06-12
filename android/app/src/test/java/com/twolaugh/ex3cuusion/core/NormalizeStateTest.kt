package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.Document
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.FolderBlockSelection
import com.twolaugh.ex3cuusion.core.store.normalizeState
import com.twolaugh.ex3cuusion.core.store.stateJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NormalizeStateTest {

    @Test
    fun `missing arrays parse as empty defaults`() {
        // A document with only the scalar fields — every collection must default, mirroring the
        // web's `??=` normalization of states written before newer fields existed.
        val state = stateJson.decodeFromString<AppState>(
            """{"currentDate":"2026-06-11","currentTime":"09:00","availableMinutes":300}"""
        )
        assertTrue(state.tasks.isEmpty())
        assertTrue(state.executionEvents.isEmpty())
        assertTrue(state.dailyReviews.isEmpty())
        assertTrue(state.captureSessions.isEmpty())
        assertTrue(state.committedPlans.isEmpty())
        assertTrue(state.dayLists.isEmpty())
        assertTrue(state.traySignals.isEmpty())
        assertTrue(state.folderBlockSelections.isEmpty())
    }

    @Test
    fun `empty folders get the personal fallback plus the Main page`() {
        val normalized = normalizeState(minimalState())
        assertEquals(listOf("folder_personal", "folder_main"), normalized.folders.map { it.id })
        assertEquals("Personal", normalized.folders[0].name)
        assertEquals(5, normalized.folders[0].weight)
        // T108: Main is the quick-capture inbox page — top-level, colour 0.
        val main = normalized.folders[1]
        assertEquals("Main", main.name)
        assertNull(main.parentFolderId)
        assertEquals(0, main.color)
    }

    @Test
    fun `dangling parentFolderId is cleared, valid links survive`() {
        val state = minimalState().copy(
            folders = listOf(
                Folder(id = "folder_a", name = "A"),
                Folder(id = "folder_b", name = "B", parentFolderId = "folder_a"),
                Folder(id = "folder_c", name = "C", parentFolderId = "folder_gone")
            )
        )
        val normalized = normalizeState(state)
        assertEquals("folder_a", normalized.folders.first { it.id == "folder_b" }.parentFolderId)
        assertNull(normalized.folders.first { it.id == "folder_c" }.parentFolderId)
    }

    @Test
    fun `task folderId pointing at a missing folder is cleared`() {
        val fixture = stateJson.decodeFromString<AppState>(loadFixtureText())
        val state = fixture.copy(folders = fixture.folders.filterNot { it.id == "container_emma" })
        val normalized = normalizeState(state)
        assertNull(normalized.tasks.first { it.id == "task_read_together" }.folderId)
        // Other placements are untouched.
        assertEquals("domain_health", normalized.tasks.first { it.id == "task_back_rehab" }.folderId)
    }

    @Test
    fun `folderBlockSelections for missing folders are dropped`() {
        val state = minimalState().copy(
            folders = listOf(Folder(id = "folder_a", name = "A")),
            folderBlockSelections = listOf(
                FolderBlockSelection(date = "2026-06-11", folderId = "folder_a", selectedTaskIds = emptyList(), updatedAt = "2026-06-11T09:00:00.000Z"),
                FolderBlockSelection(date = "2026-06-11", folderId = "folder_gone", selectedTaskIds = emptyList(), updatedAt = "2026-06-11T09:00:00.000Z")
            )
        )
        val normalized = normalizeState(state)
        assertEquals(listOf("folder_a"), normalized.folderBlockSelections.map { it.folderId })
    }

    @Test
    fun `normalizing the seed fixture only adds the Main page and the dump note`() {
        val fixture = stateJson.decodeFromString<AppState>(loadFixtureText())
        val normalized = normalizeState(fixture)
        // T108/B3: the web seed predates the Main page and the dump note, so normalize adds
        // exactly those two and touches nothing else.
        val main = normalized.folders.last()
        assertEquals("folder_main", main.id)
        val dump = normalized.documents.first()
        assertEquals("doc_dump", dump.id)
        assertEquals(
            fixture,
            normalized.copy(
                folders = normalized.folders.filterNot { it.id == "folder_main" },
                documents = normalized.documents.filterNot { it.id == "doc_dump" }
            )
        )
        // A state that already has both is a pure fixed point.
        assertEquals(normalized, normalizeState(normalized))
    }

    @Test
    fun `the dump note is ensured in Main with the state clock, an existing dump is untouched`() {
        val normalized = normalizeState(minimalState())
        val dump = normalized.documents.single()
        assertEquals("doc_dump", dump.id)
        assertEquals("folder_main", dump.folderId)
        assertEquals("Dump", dump.title)
        assertEquals("", dump.body)
        assertEquals("2026-06-11T09:00:00.000Z", dump.createdAt)
        assertEquals(dump.createdAt, dump.updatedAt)

        // An existing doc_dump is left exactly as the user has it (renamed/moved/filled is fine).
        val customized = normalized.copy(
            documents = listOf(dump.copy(title = "Inbox", body = "- 09:00 keep me"))
        )
        val renormalized = normalizeState(customized)
        assertEquals("Inbox", renormalized.documents.single().title)
        assertEquals("- 09:00 keep me", renormalized.documents.single().body)
    }

    @Test
    fun `documents with a dangling folderId reparent to Main`() {
        val state = minimalState().copy(
            folders = listOf(Folder(id = "folder_a", name = "A")),
            documents = listOf(
                Document(
                    id = "doc_0001", folderId = "folder_a", body = "stays put",
                    createdAt = "2026-06-11T09:00:00.000Z", updatedAt = "2026-06-11T09:00:00.000Z"
                ),
                Document(
                    id = "doc_0002", folderId = "folder_gone", body = "orphaned",
                    createdAt = "2026-06-11T09:00:00.000Z", updatedAt = "2026-06-11T09:00:00.000Z"
                )
            )
        )
        val normalized = normalizeState(state)
        assertEquals("folder_a", normalized.documents.first { it.id == "doc_0001" }.folderId)
        // A note never dangles: it reparents to the Main page instead of clearing like a task.
        assertEquals("folder_main", normalized.documents.first { it.id == "doc_0002" }.folderId)
        assertTrue(normalized.folders.any { it.id == "folder_main" })
    }
}
