package com.twolaugh.ex3cuusion.core

import com.twolaugh.ex3cuusion.core.model.AppState

fun loadFixtureText(): String =
    checkNotNull(object {}.javaClass.getResource("/state-fixture.json")) { "fixture missing" }.readText()

// Minimal valid AppState for store/undo tests; collection fields fall back to their defaults.
fun minimalState(availableMinutes: Int = 300): AppState = AppState(
    currentDate = "2026-06-11",
    currentTime = "09:00",
    availableMinutes = availableMinutes
)
