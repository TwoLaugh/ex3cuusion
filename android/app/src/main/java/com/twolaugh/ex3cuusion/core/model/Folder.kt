package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Folder(
    val id: String,
    val name: String,
    val parentFolderId: String? = null,
    val weight: Int? = null,
    val canBlock: Boolean? = null,
    val defaultBlockMinutes: Int? = null,
    val contextNote: String? = null,
    val status: FolderStatus? = null,
    // T108: palette INDEX into the 8-tone pages palette (not a raw colour value), so the tones
    // can be tuned centrally without touching stored state. Absent = unset (renders tone 0).
    val color: Int? = null
)

@Serializable
data class FolderBlockSelection(
    val date: String,
    val folderId: String,
    val selectedTaskIds: List<String>,
    val updatedAt: String
)
