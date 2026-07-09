package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.store.StateStore
import com.twolaugh.ex3cuusion.core.store.stateJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class StateStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun fixtureState(): AppState = stateJson.decodeFromString(loadFixtureText())

    @Test
    fun `load returns null when no document exists`() {
        assertNull(StateStore(tmp.newFolder()).load())
    }

    @Test
    fun `save then load round-trips the full seed state`() {
        val dir = tmp.newFolder()
        val saved = StateStore(dir).save(fixtureState())
        // A NEW store over the same directory (process restart) sees the same state.
        val reloaded = StateStore(dir).load()
        assertEquals(saved, reloaded)
        assertEquals(6, reloaded?.tasks?.size)
    }

    @Test
    fun `save replaces an existing document and leaves no temp file behind`() {
        val dir = tmp.newFolder()
        val store = StateStore(dir)
        store.save(fixtureState())
        store.save(fixtureState().copy(currentDate = "2026-06-12"))
        assertEquals("2026-06-12", StateStore(dir).load()?.currentDate)
        assertFalse(File(dir, "state.json.tmp").exists())
    }

    @Test
    fun `save normalizes before writing`() {
        val dir = tmp.newFolder()
        StateStore(dir).save(minimalState()) // no folders -> personal fallback + Main page persisted
        val reloaded = StateStore(dir).load()
        assertEquals(listOf("folder_personal", "folder_main"), reloaded?.folders?.map { it.id })
    }

    @Test
    fun `load normalizes a document written with a dangling folder link`() {
        val dir = tmp.newFolder()
        // Write raw JSON (as if an older/buggy writer produced it), bypassing save().
        val raw = loadFixtureText().replace("\"folderId\": \"domain_house\"", "\"folderId\": \"folder_gone\"")
        File(dir, "state.json").writeText(raw)
        val loaded = StateStore(dir).load()
        assertNull(loaded?.tasks?.first { it.id == "task_clean_garage" }?.folderId)
    }

    @Test
    fun `written document is web-readable JSON with arrays always present`() {
        val dir = tmp.newFolder()
        StateStore(dir).save(minimalState())
        val text = File(dir, "state.json").readText()
        // The web reads state.tasks (and friends) without defaulting every one of them, so the
        // store must always write the collection fields even when empty.
        assertTrue(text.contains("\"tasks\":[]"))
        assertTrue(text.contains("\"completions\":[]"))
        assertTrue(text.contains("\"traySignals\":[]"))
    }
}
