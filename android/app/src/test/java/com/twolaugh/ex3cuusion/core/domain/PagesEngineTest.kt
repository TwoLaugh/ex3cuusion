package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.Document
import com.twolaugh.ex3cuusion.core.model.Folder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// T108: document CRUD on the DomainEngine + the Pages read models.
class PagesEngineTest {

    @Test
    fun `createDocument assigns scanning ids, lands in the folder, and undo removes it`() {
        val engine = testEngine()
        val first = engine.createDocument("domain_health", "eczema protocol draft", title = "Eczema")
        val second = engine.createDocument("domain_health", "second note")
        assertEquals("doc_0001", first)
        assertEquals("doc_0002", second)

        val created = engine.state.documents.first { it.id == first }
        assertEquals("domain_health", created.folderId)
        assertEquals("Eczema", created.title)
        assertEquals("eczema protocol draft", created.body)
        assertEquals("2026-06-01T08:30:00.000Z", created.createdAt)
        assertEquals(created.createdAt, created.updatedAt)

        engine.undoChange() // undoes the second create
        engine.undoChange() // undoes the first
        assertTrue(engine.state.documents.isEmpty())
    }

    @Test
    fun `createDocument with an unknown folder falls back to Main`() {
        val engine = testEngine() // the seed has no folder_main at all
        engine.createDocument("folder_gone", "orphan jot")
        val doc = engine.state.documents.single()
        assertEquals("folder_main", doc.folderId)
        // The Main page was materialized so the note has a real home.
        assertEquals("Main", engine.state.folders.first { it.id == "folder_main" }.name)
    }

    @Test
    fun `updateDocument bumps updatedAt and records history, unchanged update is a pure no-op`() {
        val engine = testEngine()
        val id = engine.createDocument("domain_health", "v1", title = "Plan")
        engine.setClock("2026-06-02", "10:00")

        val historyBefore = engine.listChangeHistory().size
        engine.updateDocument(id, body = "v1") // same body, title not provided -> nothing changed
        assertEquals(historyBefore, engine.listChangeHistory().size)
        assertEquals("2026-06-01T08:30:00.000Z", engine.state.documents.single().updatedAt)

        engine.updateDocument(id, title = "", body = "v2") // "" clears the title
        val updated = engine.state.documents.single()
        assertEquals("v2", updated.body)
        assertNull(updated.title)
        assertEquals("2026-06-02T10:00:00.000Z", updated.updatedAt)
        assertEquals("2026-06-01T08:30:00.000Z", updated.createdAt) // createdAt never moves
        assertEquals(historyBefore + 1, engine.listChangeHistory().size)
    }

    @Test
    fun `deleteDocument removes the note and undo restores it`() {
        val engine = testEngine()
        val id = engine.createDocument("domain_house", "garage shelf measurements")
        engine.deleteDocument(id)
        assertTrue(engine.state.documents.isEmpty())
        engine.undoChange()
        assertEquals("garage shelf measurements", engine.state.documents.single().body)
        assertEquals(id, engine.state.documents.single().id)
    }

    @Test
    fun `moveDocument refiles to a valid folder and ignores unknown targets`() {
        val engine = testEngine()
        val id = engine.createDocument("domain_health", "note")
        engine.setClock("2026-06-03", "09:00")

        engine.moveDocument(id, "folder_gone") // unknown target: silent no-op
        assertEquals("domain_health", engine.state.documents.single().folderId)
        assertEquals("2026-06-01T08:30:00.000Z", engine.state.documents.single().updatedAt)

        engine.moveDocument(id, "domain_house")
        val moved = engine.state.documents.single()
        assertEquals("domain_house", moved.folderId)
        // The receiving page rises in the grid: a move bumps updatedAt.
        assertEquals("2026-06-03T09:00:00.000Z", moved.updatedAt)
    }

    @Test
    fun `setFolderColor clamps to the palette and a same-colour tap records nothing`() {
        val engine = testEngine()
        engine.setFolderColor("domain_health", 3)
        assertEquals(3, engine.state.folders.first { it.id == "domain_health" }.color)

        engine.setFolderColor("domain_health", 99) // clamped to the last tone
        assertEquals(7, engine.state.folders.first { it.id == "domain_health" }.color)

        val historyBefore = engine.listChangeHistory().size
        engine.setFolderColor("domain_health", 7) // unchanged -> no history
        engine.setFolderColor("folder_gone", 2) // unknown folder -> no-op
        assertEquals(historyBefore, engine.listChangeHistory().size)
    }

    @Test
    fun `folderRecency takes the max of note edits and task completions, and orders the grid`() {
        val base = seedState()
        val state = base.copy(
            folders = base.folders + Folder(id = "folder_main", name = "Main", color = 0),
            documents = listOf(
                Document(
                    id = "doc_0001", folderId = "domain_house", body = "old note",
                    createdAt = "2026-05-01T08:00:00.000Z", updatedAt = "2026-05-01T08:00:00.000Z"
                ),
                Document(
                    id = "doc_0002", folderId = "domain_health", body = "fresh note",
                    createdAt = "2026-06-01T07:00:00.000Z", updatedAt = "2026-06-01T07:00:00.000Z"
                )
            ),
            tasks = base.tasks.map { task ->
                // A house task completed AFTER the house note was edited wins the folder's recency.
                if (task.id == "task_clean_garage") task.copy(lastCompletedAt = "2026-05-20T12:00:00.000Z") else task
            }
        )

        assertEquals("2026-05-20T12:00:00.000Z", folderRecency(state, "domain_house"))
        assertEquals("2026-06-01T07:00:00.000Z", folderRecency(state, "domain_health"))
        assertNull(folderRecency(state, "domain_work")) // nothing ever happened there

        val cards = buildPagesView(state).cards
        assertEquals("folder_main", cards[0].folderId) // Main pinned first, recency or not
        assertEquals("domain_health", cards[1].folderId) // newest note edit
        assertEquals("domain_house", cards[2].folderId) // then the task completion
        // Untouched folders trail, alphabetically.
        assertTrue(cards.indexOfFirst { it.folderId == "domain_work" } > cards.indexOfFirst { it.folderId == "domain_house" })

        val healthCard = cards.first { it.folderId == "domain_health" }
        assertEquals(1, healthCard.noteCount)
        assertEquals(1, healthCard.activeTaskCount) // task_back_rehab
        assertEquals("fresh note", healthCard.previewBody)
    }
}
