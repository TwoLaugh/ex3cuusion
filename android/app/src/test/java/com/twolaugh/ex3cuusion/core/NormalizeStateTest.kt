package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.model.AppState
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
    fun `empty folders get the personal fallback`() {
        val normalized = normalizeState(minimalState())
        assertEquals(1, normalized.folders.size)
        assertEquals("folder_personal", normalized.folders[0].id)
        assertEquals("Personal", normalized.folders[0].name)
        assertEquals(5, normalized.folders[0].weight)
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
    fun `normalizing the seed fixture changes nothing`() {
        val fixture = stateJson.decodeFromString<AppState>(loadFixtureText())
        assertEquals(fixture, normalizeState(fixture))
    }
}
