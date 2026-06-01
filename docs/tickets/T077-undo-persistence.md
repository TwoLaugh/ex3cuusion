# T077: Undo/History Persistence

Status: planned.

Hardens T061 (history is in-memory / per-process only).

## Goal

Persist the change-history so undo survives restarts and works with the Postgres/file
repositories, not just in-memory.

## Scope

- Persist change snapshots (or compact diffs) alongside the repository (Postgres table / file),
  with the same bounded cap.
- Decide snapshot vs diff storage (snapshots are simplest but larger).

## Acceptance Criteria

- Undo works after a server restart and under the Postgres repository.

## Notes

Lower priority for local single-user dev (in-memory is fine); matters for the durable V1 path.
