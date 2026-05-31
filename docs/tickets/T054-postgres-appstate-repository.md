# T054: Postgres AppState Repository

Status: superseded by normalized Postgres repository.

## Goal

Move the app from in-memory/file-backed state to a Postgres-backed repository while preserving current behavior.

## Scope

- Bridge the current app to Postgres with normalized table mappers.
- Add read/write mappers between Postgres rows and `AppState`.
- Keep the existing `AppStateRepository` boundary.
- Add a feature flag/env switch for Postgres storage.
- Seed local development data through the database.
- Add integration tests for reset, read, write, AI capture, completion, and planner flows.

## Acceptance Criteria

- Existing unit, E2E, and AI evals pass using the Postgres repository.
- File/in-memory repository remains available for fast tests until fully retired.
- App behavior is unchanged from the user perspective.

## Implementation Notes

- The first repository bridge stored full `AppState` snapshots in Postgres because current runtime IDs are stable product strings while the normalized schema uses UUID primary keys.
- Runtime string IDs are projected into `external_id` columns on the normalized tables so the app can keep stable product IDs while Postgres owns UUID primary keys.
- Current projection writes domains, containers, tasks, routines, execution events, inbox items, AI actions, capture sessions, messages, clarification questions, and revision events into normalized tables.
- `app_runtime_state` stores app-level date/time/capacity plus deferral/completion arrays, project block selections, daily reviews, and entity ordering needed to reconstruct the current `AppState`.
- Postgres reads now use normalized rows only.
- Normalized child rows are pruned when capture-session messages, questions, or revision events disappear from the current state.
- Migration `010_drop_app_state_snapshots.sql` removes the old snapshot table.
