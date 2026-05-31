# T054: Postgres AppState Repository

Status: in progress. Snapshot repository and normalized write projection are implemented; normalized read-back is still pending.

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
- Normalized child rows are pruned when capture-session messages, questions, or revision events disappear from the current snapshot.
- The next step for this ticket is normalized read-back, or an explicit decision that snapshots remain the runtime source of truth for V1 while relational tables serve analytics/admin/read-model surfaces.
