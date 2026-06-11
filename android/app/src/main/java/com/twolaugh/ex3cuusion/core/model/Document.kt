package com.twolaugh.ex3cuusion.core.model

import kotlinx.serialization.Serializable

// T108: a free-text note living inside a folder (Keep-style page). Text-only v1 — checklist
// notes (task-bound items) are v1.1, so there is deliberately no `kind` field yet; adding one
// later with a default keeps old documents parsing.
@Serializable
data class Document(
    val id: String,
    val folderId: String,
    val title: String? = null,
    val body: String,
    val createdAt: String,
    val updatedAt: String
)
