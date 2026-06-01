# T072: Backlog & Container Management

Status: planned.

## Goal

Let the user groom the category↔task backlog directly — move tasks between projects/domains,
reprioritize, and promote/demote (today / this week / someday) — without the AI.

## Current state

Tasks can be reassigned to a project/domain one at a time via the edit form. There is no manual
promote/demote control, no bulk move, and no manual ordering — promote/demote/reprioritize is
only available through the AI's update_task (T064).

## Scope

- A backlog management surface (likely the Tasks panel) with:
  - manual promote/demote controls (today / this week / next week / someday) per task, reusing the
    same date-intent semantics as the AI's update_task;
  - move project and domain inline (and a bulk select → move/promote/demote for several tasks);
  - a clear ordering/sort (by pressure, deadline, or a manual rank).
- Server: reuse `applyTaskDateIntent` (T064) for manual promote/demote so AI and manual paths
  share one code path.

## Acceptance Criteria

- A user can move tasks between containers, promote/demote them, and reprioritize — including in
  bulk — entirely from the UI.
- Manual and AI grooming use the same underlying semantics.

## Open decision

Drag-and-drop (between days / containers) vs explicit buttons/menus. Recommend explicit controls
first; drag-and-drop as a later UI-polish ticket.
