# T054: Postgres AppState Repository

Status: planned.

## Goal

Move the app from in-memory/file-backed state to a Postgres-backed repository while preserving current behavior.

## Scope

- Add read/write mappers between Postgres rows and `AppState`.
- Keep the existing `AppStateRepository` boundary.
- Add a feature flag/env switch for Postgres storage.
- Seed local development data through the database.
- Add integration tests for reset, read, write, AI capture, completion, and planner flows.

## Acceptance Criteria

- Existing unit, E2E, and AI evals pass using the Postgres repository.
- File/in-memory repository remains available for fast tests until fully retired.
- App behavior is unchanged from the user perspective.

