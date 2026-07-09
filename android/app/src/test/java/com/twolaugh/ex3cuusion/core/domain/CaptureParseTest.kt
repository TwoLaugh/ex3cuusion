package com.twolaugh.ex3cuusion.core.domain

import org.junit.Assert.assertEquals
import org.junit.Test

// Time at capture — the deterministic trailing-token grammar (CaptureParse.kt). The capture
// field IS the time picker, so this parser must be conservative: every assertion here is a
// contract about what does and does NOT count as a time.
class CaptureParseTest {

    private fun parse(raw: String, now: String = "08:30") = parseCaptureTime(raw, now)

    // --- explicit tokens ----------------------------------------------------------------------

    @Test
    fun `explicit pm tokens pin the evening reading and tidy the title`() {
        assertEquals(ParsedCapture("Call mum", "18:00"), parse("Call mum 6pm"))
        assertEquals(ParsedCapture("Dentist", "18:30"), parse("Dentist 6:30pm"))
        assertEquals(ParsedCapture("Dentist", "18:30"), parse("Dentist 6.30pm"))
        assertEquals(ParsedCapture("Email Sam", "18:00"), parse("Email Sam @6pm"))
        assertEquals(ParsedCapture("Standup", "09:15"), parse("Standup at 9:15am"))
        // 12-hour wraparound: 12am is midnight, 12pm is noon
        assertEquals(ParsedCapture("Night meds", "00:00"), parse("Night meds 12am"))
        assertEquals(ParsedCapture("Lunch", "12:00"), parse("Lunch 12pm"))
        // explicit am stands even when that clock time has already passed today
        assertEquals(ParsedCapture("Wake early", "06:00"), parse("Wake early 6am", now = "08:30"))
    }

    @Test
    fun `24h tokens are explicit and never consult the clock`() {
        assertEquals(ParsedCapture("Gym", "18:00"), parse("Gym 18:00", now = "23:00"))
        assertEquals(ParsedCapture("Server check", "18:00"), parse("Server check at 18"))
        assertEquals(ParsedCapture("Server check", "18:00"), parse("Server check at 18.00"))
        // a leading-zero two-digit hour is a 24h spelling: "06:30" means 06:30, not "maybe pm"
        assertEquals(ParsedCapture("Flight", "06:30"), parse("Flight 06:30", now = "10:00"))
    }

    // --- the ambiguity rule -------------------------------------------------------------------

    @Test
    fun `bare at-N resolves to the nearest future reading`() {
        // 06:00 already passed at 08:30 -> pm
        assertEquals(ParsedCapture("Call gran", "18:00"), parse("Call gran at 6", now = "08:30"))
        // 06:00 still ahead at 05:10 -> am
        assertEquals(ParsedCapture("Run", "06:00"), parse("Run at 6", now = "05:10"))
        // 11:00 passed, 23:00 ahead at 22:30 -> pm
        assertEquals(ParsedCapture("Wind down", "23:00"), parse("Wind down at 11", now = "22:30"))
        // BOTH readings passed at 23:30 -> the nearest future is tomorrow morning -> am
        assertEquals(ParsedCapture("Prep notes", "06:00"), parse("Prep notes at 6", now = "23:30"))
        // "at 12": 00:00 passed, 12:00 ahead in the morning -> noon
        assertEquals(ParsedCapture("Lunch", "12:00"), parse("Lunch at 12", now = "08:30"))
        // colon pair without meridiem is the same ambiguous shape
        assertEquals(ParsedCapture("Meet Bob", "18:30"), parse("Meet Bob 6:30", now = "08:30"))
    }

    // --- rejections (no token = title untouched) ------------------------------------------------

    @Test
    fun `text without a clearly-delimited trailing token is unchanged`() {
        assertEquals(ParsedCapture("Buy 6 eggs", null), parse("Buy 6 eggs"))
        assertEquals(ParsedCapture("Read chapter 12", null), parse("Read chapter 12"))
        assertEquals(ParsedCapture("Look at 6 things", null), parse("Look at 6 things")) // not trailing
        assertEquals(ParsedCapture("Install version 6.30", null), parse("Install version 6.30")) // bare dot pair
        assertEquals(ParsedCapture("Catch flight BA2026", null), parse("Catch flight BA2026"))
        assertEquals(ParsedCapture("Fix bug at 25", null), parse("Fix bug at 25")) // no such hour
        assertEquals(ParsedCapture("Set alarm 6:75", null), parse("Set alarm 6:75")) // no such minute
    }

    // --- title tidying -------------------------------------------------------------------------

    @Test
    fun `token removal trims connective punctuation and never leaves an empty title`() {
        assertEquals(ParsedCapture("Dentist", "18:30"), parse("Dentist, 6:30pm"))
        assertEquals(ParsedCapture("Pick up keys", "17:00"), parse("Pick up keys — 5pm"))
        assertEquals(ParsedCapture("Therapy", "14:00"), parse("  Therapy   at 2pm  "))
        // a capture that is ONLY a time keeps its raw text as the title and pins nothing
        assertEquals(ParsedCapture("6pm", null), parse("6pm"))
        assertEquals(ParsedCapture("at 6", null), parse("at 6"))
    }
}
