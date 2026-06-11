package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.store.UndoStack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class UndoStackTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun historyFile(): File = File(tmp.newFolder(), "history.json")

    @Test
    fun `undo with no history returns null`() {
        assertNull(UndoStack(historyFile()).undo())
    }

    @Test
    fun `undo restores the snapshot taken before the last change`() {
        val stack = UndoStack(historyFile())
        // Snapshot-before-mutate: the entry holds the state as it was BEFORE the change applied.
        stack.record("manual_edit", "Changed capacity to 100", "2026-06-11T09:00:00.000Z", minimalState(300))
        stack.record("manual_edit", "Changed capacity to 200", "2026-06-11T09:01:00.000Z", minimalState(100))
        assertEquals(minimalState(100), stack.undo())
        assertEquals(1, stack.size)
        assertEquals(minimalState(300), stack.undo())
        assertEquals(0, stack.size)
    }

    @Test
    fun `undo to an entry id rewinds that change and every later one (LIFO)`() {
        val stack = UndoStack(historyFile())
        stack.record("a", "first", "2026-06-11T09:00:00.000Z", minimalState(1))
        val second = stack.record("b", "second", "2026-06-11T09:01:00.000Z", minimalState(2))
        stack.record("c", "third", "2026-06-11T09:02:00.000Z", minimalState(3))
        assertEquals(minimalState(2), stack.undo(second.id))
        assertEquals(1, stack.size) // only the first entry remains
        assertEquals("first", stack.list().single().summary)
    }

    @Test
    fun `undo to an unknown id is a no-op`() {
        val stack = UndoStack(historyFile())
        stack.record("a", "first", "2026-06-11T09:00:00.000Z", minimalState(1))
        assertNull(stack.undo("history_nope"))
        assertEquals(1, stack.size)
    }

    @Test
    fun `history caps at 50 entries dropping the oldest`() {
        val stack = UndoStack(historyFile())
        repeat(60) { i ->
            stack.record("cap", "change $i", "2026-06-11T09:00:00.000Z", minimalState(i))
        }
        assertEquals(50, stack.size)
        assertEquals("change 59", stack.list().first().summary) // newest first
        assertEquals("change 10", stack.list().last().summary) // 0..9 dropped
    }

    @Test
    fun `history persists to disk and survives a restart`() {
        val file = historyFile()
        val first = UndoStack(file)
        first.record("manual_edit", "Changed capacity", "2026-06-11T09:00:00.000Z", minimalState(300))

        val rebooted = UndoStack(file)
        assertEquals(1, rebooted.size)
        assertEquals("Changed capacity", rebooted.list().single().summary)
        assertEquals(minimalState(300), rebooted.undo())

        // The rewind was persisted too.
        assertEquals(0, UndoStack(file).size)
    }

    @Test
    fun `corrupt history file means undo starts fresh`() {
        val file = historyFile()
        file.writeText("{not json!!!")
        val stack = UndoStack(file)
        assertEquals(0, stack.size)
        assertNull(stack.undo())
        // And it can still record over the corpse.
        stack.record("a", "first", "2026-06-11T09:00:00.000Z", minimalState(1))
        assertEquals(1, UndoStack(file).size)
    }
}
