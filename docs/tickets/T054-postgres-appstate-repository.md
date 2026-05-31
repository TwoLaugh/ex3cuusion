# T054: Postgres AppState Repository

Status: implemented.

## Goal

Move the app from in-memory/file-backed state to a Postgres-backed repository while preserving current behavior.

## Scope

- Bridge the current app to Postgres with a snapshot-backed repository while normalized table mappers are designed.
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

- The first repository bridge stores full `AppState` snapshots in Postgres because current runtime IDs are stable product strings while the normalized schema uses UUID primary keys.
- Runtime string IDs are projected into `external_id` columns on the normalized tables so the app can keep stable product IDs while Postgres owns UUID primary keys.
- Current projection writes domains, containers, tasks, routines, execution events, inbox items, AI actions, capture sessions, messages, clarification questions, and revision events inside the same transaction as the snapshot.
- `app_runtime_state` stores app-level date/time/capacity plus legacy deferral/completion arrays and entity ordering needed to reconstruct the current `AppState`.
- Postgres reads now prefer normalized rows and fall back to the snapshot only when normalized runtime state is absent.
- Normalized child rows are pruned when capture-session messages, questions, or revision events disappear from the current snapshot.
- The snapshot remains as a rollback/debug bridge, but it is no longer the primary read source when normalized projection is available.
