# T054: Postgres AppState Repository

Status: in progress.

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
- Normalized table mappers should follow after the ID strategy is settled, without blocking the app from running on Postgres in the meantime.
