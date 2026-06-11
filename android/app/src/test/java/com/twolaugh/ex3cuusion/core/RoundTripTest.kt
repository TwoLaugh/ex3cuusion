package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.Carryover
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.PreferredWindow
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.store.stateJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The critical compatibility spec: the fixture is the web seed exactly as the web's
// FileAppStateRepository writes it (JSON.stringify of createSeedState()). Android must parse it,
// re-serialize it, and parse its own output back to an identical object graph.
class RoundTripTest {

    private fun parseFixture(): AppState = stateJson.decodeFromString(loadFixtureText())

    @Test
    fun `fixture parses, re-serializes, and re-parses to a deep-equal state`() {
        val first = parseFixture()
        val serialized = stateJson.encodeToString(AppState.serializer(), first)
        val second = stateJson.decodeFromString<AppState>(serialized)
        assertEquals(first, second)
    }

    @Test
    fun `fixture carries the full web seed`() {
        val state = parseFixture()
        assertEquals("2026-06-11", state.currentDate)
        assertEquals(300, state.availableMinutes)
        assertEquals(7, state.folders.size)
        assertEquals(6, state.tasks.size)
        assertTrue(state.dayLists.isEmpty())
        assertTrue(state.traySignals.isEmpty())
        assertTrue(state.committedPlans.isEmpty())
    }

    @Test
    fun `task_read_together repeat policy survives with weekly days and cooldown`() {
        val task = parseFixture().tasks.first { it.id == "task_read_together" }
        val policy = task.repeatPolicy as RepeatPolicy.Weekly
        assertEquals(listOf(0, 3, 6), policy.days)
        assertEquals(Carryover.Skip, policy.carryover)
        assertEquals(3, policy.cooldownDays)
        assertNull(policy.preferredWindow)
    }

    @Test
    fun `task_back_rehab keeps dateIntent and daily repeat policy`() {
        val task = parseFixture().tasks.first { it.id == "task_back_rehab" }
        val intent = checkNotNull(task.dateIntent)
        assertEquals(DateIntentKind.Recurring, intent.kind)
        assertEquals(0.9, intent.confidence, 0.0)
        val policy = task.repeatPolicy as RepeatPolicy.Daily
        assertEquals(PreferredWindow.Morning, policy.preferredWindow)
        assertEquals(Carryover.Skip, policy.carryover)
    }

    @Test
    fun `folder parent links survive`() {
        val folders = parseFixture().folders.associateBy { it.id }
        assertEquals("domain_product", folders.getValue("project_diet_app").parentFolderId)
        assertEquals("domain_social", folders.getValue("container_emma").parentFolderId)
        assertNull(folders.getValue("domain_health").parentFolderId)
    }

    @Test
    fun `enums and discriminators serialize with the exact web literals, absent optionals stay absent`() {
        val serialized = stateJson.encodeToString(AppState.serializer(), parseFixture())
        assertTrue(serialized.contains("\"type\":\"weekly\""))
        assertTrue(serialized.contains("\"type\":\"none\""))
        assertTrue(serialized.contains("\"completionBehavior\":\"keep_as_suggestion\""))
        assertTrue(serialized.contains("\"strictness\":\"flexible\""))
        // No nulls and no unset optionals on the wire — the TS writer simply omits them.
        assertFalse(serialized.contains("null"))
        assertFalse(serialized.contains("\"habit\""))
        assertFalse(serialized.contains("\"description\""))
    }

    @Test
    fun `documents and folder colour round-trip, with unknown keys inside them ignored`() {
        // T108 fixture pattern: graft a documents array + a folder colour into the web-seed text
        // (as a newer writer would produce it), with an unknown key inside the document to prove
        // the tolerance survives at every level.
        val withPages = loadFixtureText()
            .replaceFirst(
                "\"folders\": [",
                """"documents": [
                    { "id": "doc_0001", "folderId": "domain_health", "title": "Eczema protocol",
                      "body": "Seal within 30s.\nReview weekly.", "kind": "text",
                      "createdAt": "2026-06-10T09:00:00.000Z", "updatedAt": "2026-06-11T08:00:00.000Z" }
                ], "folders": ["""
            )
            .replaceFirst(
                """{ "id": "domain_health", "name": "Health Repair", "weight": 10 }""",
                """{ "id": "domain_health", "name": "Health Repair", "weight": 10, "color": 4 }"""
            )

        val first = stateJson.decodeFromString<AppState>(withPages)
        val doc = first.documents.single()
        assertEquals("doc_0001", doc.id)
        assertEquals("domain_health", doc.folderId)
        assertEquals("Eczema protocol", doc.title)
        assertEquals("Seal within 30s.\nReview weekly.", doc.body)
        assertEquals("2026-06-11T08:00:00.000Z", doc.updatedAt)
        assertEquals(4, first.folders.first { it.id == "domain_health" }.color)
        assertNull(first.folders.first { it.id == "domain_work" }.color)

        // Re-serialize and re-parse: deep equal, colour and documents intact, no nulls leaked.
        val serialized = stateJson.encodeToString(AppState.serializer(), first)
        assertEquals(first, stateJson.decodeFromString<AppState>(serialized))
        assertTrue(serialized.contains("\"color\":4"))
        assertFalse(serialized.contains("null"))
    }

    @Test
    fun `unknown keys from a newer web build are ignored`() {
        val withExtra = loadFixtureText().replaceFirst(
            "\"currentDate\"",
            "\"someFutureField\": {\"nested\": [1, 2]}, \"currentDate\""
        )
        val state = stateJson.decodeFromString<AppState>(withExtra)
        assertEquals("2026-06-11", state.currentDate)
        assertEquals(6, state.tasks.size)
    }
}
