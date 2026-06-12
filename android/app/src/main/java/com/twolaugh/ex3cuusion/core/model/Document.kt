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
    val updatedAt: String,
    // B3: when the note was last OPENED (read) — transient telemetry for the Pages "recent"
    // ordering, bumped directly on editor open (not undoable, no history). Additive optional:
    // absent in old documents and in anything the web writes, and stateJson's encodeDefaults=false
    // keeps it off the wire while null, matching the other optional fields here.
    val lastViewedAt: String? = null
)
