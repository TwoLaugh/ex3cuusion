# T021: Execution Outcome Events

## Goal

Replace the narrow completion/deferral split with a richer event model that records what actually happened without forcing the task itself into a misleading state.

Partial completion should usually be captured after execution, not clarified before planning.

## Event Types

- `completed`
- `worked_on`
- `partially_completed`
- `deferred`
- `blocked`
- `waiting_on`
- `skipped`
- `canceled`
- `marked_not_important`

## Model

Add a `TaskEvent` / `ExecutionEvent` concept with:

- task id
- plan item id optional
- event type
- reason optional
- note optional
- actual minutes optional
- next action optional
- blocked/waiting metadata optional
- created at

The task can remain `active` while accumulating history.

Examples:

- `Clean house` gets `worked_on 35m: cleaned kitchen, hallway still bad`.
- `Finish auth bug` gets `partially_completed: found issue, still need regression test`.
- `Read together` gets `completed` but remains available because completion behavior is reusable.

## Acceptance Criteria

- Completion and deferral routes write execution events.
- Existing `completion_events` and `deferral_logs` behavior is either migrated or wrapped by the new event model.
- Task status only changes when the event genuinely changes task state.
- Tests cover completed, worked_on, partially_completed, blocked, waiting_on, and skipped.
- Planner can read event history for same-day status and future calibration.

## Non-Goals

- full AI interpretation of freeform event notes
- analytics dashboard
- Postgres migration
