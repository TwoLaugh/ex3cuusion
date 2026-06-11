@file:OptIn(ExperimentalSerializationApi::class)

package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

// Mirrors AppState in src/lib/types.ts. Collection fields default to empty so a partial document
// parses (the web's normalizeState `??=` layer), but are ALWAYS encoded because the web writes
// them explicitly and reads some (e.g. tasks) without defaulting.
@Serializable
data class AppState(
    val currentDate: String,
    val currentTime: String,
    val availableMinutes: Int,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val folders: List<Folder> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val folderBlockSelections: List<FolderBlockSelection> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val tasks: List<Task> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val deferrals: List<DeferralLog> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val completions: List<CompletionEvent> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val executionEvents: List<ExecutionEvent> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val dailyReviews: List<DailyReview> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val inbox: List<InboxEntry> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val captureSessions: List<CaptureSession> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val committedPlans: List<CommittedDayPlan> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val dayLists: List<DayList> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val traySignals: List<TraySignal> = emptyList(),
    val lastAutoOrganizeDate: String? = null,
    val autoOrganizeEnabled: Boolean? = null
)
