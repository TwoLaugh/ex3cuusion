# T004: Implement Completion And Deferral Loop

## Goal

Let users complete or defer Today items and create planner feedback data.

## Scope

- `POST /plan-items/{id}/complete`
- `POST /plan-items/{id}/defer`
- Completion event creation
- Deferral log creation
- Deferral modal UI

## Requirements

- Deferral reason is required.
- Completion creates an append-only completion event.
- Deferral creates an append-only deferral log.
- Linked task status updates only according to LLD rules.
- Project block completion supports selected-subtask completion.

## Acceptance

- Completing an atomic task marks item and task done.
- Deferring a task moves it to Later / Deferred.
- Deferring with `too_vague` or `overplanned` is visible in planner/debug data.

