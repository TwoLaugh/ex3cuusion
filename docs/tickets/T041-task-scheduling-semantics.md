# T041: Task Scheduling Semantics

Status: implemented in V1 foundation.

## Goal

Represent whether a task consumes exclusive attention, can run in the background, can overlap with compatible work, or has phases.

## Scope

- Add scheduling metadata to tasks.
- Track scheduling mode, attention load, overlap capability, overlap kinds, and optional phases.
- Keep the user-facing capture simple; these fields are primarily AI-filled.

## Acceptance Criteria

- Task model supports `exclusive`, `background`, `concurrent`, and `phased` scheduling modes.
- Planner items expose mode/load metadata for UI and debug surfaces.
- Background/passive work does not consume the full day like exclusive work.
