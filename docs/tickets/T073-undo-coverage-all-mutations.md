# T073: Undo Coverage for All Mutations

Status: planned.

Hardens T061 (which only records AI inbox/capture operations).

## Goal

Every user-visible state change is undoable, not just AI inbox/capture actions — so the
auto-apply-with-undo model is complete and consistent across manual and AI paths.

## Current gap

`recordChange` is only called from `submitInbox`, `answerCaptureQuestion`,
`addCaptureSessionMessage`, and the organizer. Manual structure edits (`applyStructureMutation`),
plan outcomes (`completePlanItem`, `deferPlanItem`, `recordPlanItemOutcome`), daily reviews,
and project-block selection are NOT in the undo history.

## Scope

- Record a change snapshot at the start of each user-facing mutation entry point:
  `applyStructureMutation` (create/update/archive of domain/project/task/routine),
  `completePlanItem`, `deferPlanItem`, `recordPlanItemOutcome`, `submitDailyReview`,
  `updateProjectBlockSelection`.
- Use a clear source label per kind (e.g. `manual_edit`, `complete`, `defer`, `outcome`,
  `review`, `block_selection`) and a concise summary for the history list.
- Keep history bounded (existing cap) and out of AppState (existing design).

## Acceptance Criteria

- After a manual task edit, a completion, a deferral, or a block-selection change, the user can
  undo it from the same Recent-changes list and state returns to the prior snapshot.
- No double-recording (one snapshot per user action).

## Implementation Notes

- `recordChange(source, summary)` already snapshots `currentState()` before mutation; just call
  it at the top of each entry point. Watch for entry points that call each other to avoid nested
  double snapshots.
