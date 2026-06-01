# T085: Completion Keeps the Task Visible (Done State)

Status: planned. (Bug / behavior.)

## Problem

Ticking a task off in the Today view removes it from the day. It should remain visible with a
clear "done" indication (strikethrough / checkmark / muted), so the day reads as a record of what
was accomplished, not an emptying list.

## Scope

- Completed plan items stay in the Today list for the day, rendered as done (not removed).
- Tick toggles done/undone (undo already exists in the state layer).
- Day load/summary still excludes completed time appropriately.

## Acceptance Criteria

- Tapping the tick marks the task done and it stays on the day with a done style; tapping again
  un-completes it.
