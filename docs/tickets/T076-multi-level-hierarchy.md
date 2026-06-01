# T076: Multi-Level Task Hierarchy

Status: planned.

Extends T071 (single level only).

## Goal

Allow subtasks to have their own subtasks (arbitrary depth), not just one level.

## Scope

- Relax the single-level guard in `resolveParentForChild` (keep cycle prevention).
- Make `hasActiveChildren` / container behavior and rollups recursive (aggregate effort and
  done-counts up the tree) without double-counting.
- UI: nested display and parent selection across levels.

## Acceptance Criteria

- A subtask can contain subtasks; rollups and the planner-container behavior work recursively;
  no cycles.

## Notes

Lower priority than single-level (T071 covers the common case). Needs care in planner/week-plan
to avoid double-counting across levels.
