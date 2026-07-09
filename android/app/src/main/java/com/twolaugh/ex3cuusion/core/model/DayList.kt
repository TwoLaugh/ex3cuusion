package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

@Serializable
data class DayListEntry(
    val taskId: String,
    val order: Int,
    val pinnedTime: String? = null,
    val source: DayListSource,
    // T095 carry honesty: how many mornings in a row this entry has carried forward unfinished.
    // Absent for entries that were not carried.
    val carriedCount: Int? = null
)

// T092: the user's hand-authored list for one day — the day's commitment (list-first Today).
@Serializable
data class DayList(
    val date: String,
    val committedAt: String,
    val entries: List<DayListEntry>
)

// T093: per-task tray telemetry; one entry per task the tray has ever shown.
@Serializable
data class TraySignal(
    val taskId: String,
    val surfacedCount: Int,
    val firstSurfacedDate: String? = null,
    val lastSurfacedDate: String? = null,
    val addedCount: Int,
    val ignoredStreak: Int,
    val lastOutcome: TrayOutcome? = null
)
