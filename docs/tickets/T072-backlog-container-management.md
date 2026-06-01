# T072: Backlog & Container Management

Status: implemented (drag-and-drop board).

## Implementation

- Backend: task update mutation accepts `dateIntentKind` (today / tomorrow / this_week /
  next_week / someday / specific_date / deadline / none) and applies it via the shared
  `applyTaskDateIntent` (T064) — so manual promote/demote and the AI use one code path. Added a
  "none" (unscheduled) intent that clears dates.
- UI: a drag-and-drop **Backlog board** in the Tasks view with five date-intent columns
  (Today / This week / Next week / Someday / Unscheduled). Dragging a task card to a column
  promotes/demotes it; each card also has a keyboard-accessible "Move…" select using the same
  call (DnD is not keyboard-accessible on its own).
- Project/domain reassignment was already available in the task editor (single + via the board's
  card editor). 
- Verified: unit test (promote/demote via dateIntentKind) + HTTP (drop-handler call path) + page
  renders. tsc + 52 unit tests green. The drag *gesture* itself needs a browser to confirm; it is
  wired to the verified mutation and mirrored by the accessible select.

## Deferred (UI polish)

Bulk multi-select actions and drag-between-days on the week/timeline views are noted as later
UI-polish tickets.

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
