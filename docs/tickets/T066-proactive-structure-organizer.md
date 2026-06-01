# T066: Proactive Structure / Hygiene Organizer

Status: implemented (MVP).

## Implementation

- `defaultOrganizerInterpreter` (ai-actions.ts): a conservative maintenance prompt over the full
  state, reusing the existing action schema — archive_task (dedupe), update_task (demote stale /
  fix priority), schedule_task (surface ready), and split via create_project + create_task +
  archive_task. Instructed to return no actions when nothing needs maintenance.
- `runOrganizerPass` (state.ts) reuses the inbox apply/history machinery (one undoable
  "organizer" change). `POST /api/organizer`. "Tidy up" button in the UI.
- `fixtureOrganizerInterpreter` deterministically archives exact-duplicate tasks (test/smoke).
- Verified: unit test (fixture dedupe) + live end-to-end (seeded two duplicates, the real model
  returned exactly one archive_task — conservative, didn't churn other tasks — and it's
  undoable). tsc + 48 unit tests green.
- Scope: triggered on demand (button/endpoint). Scheduled/auto-trigger and richer maintenance
  (recategorize, stale detection heuristics) can extend this later. Supersedes T020.

## Goal

The AI keeps the system organized over time, not only when explicitly commanded — the "remember
and structure the work" capability. Extends the deferred V2 idea (T020) into a core feature.

## Scope

- A periodic / triggered organizer pass that inspects the whole store and detects:
  - duplicate or near-duplicate tasks;
  - bloated projects that should be split;
  - stale, vague, or long-untouched items;
  - mis-filed tasks (wrong project/area);
  - backlog items now ready to schedule.
- Output: reversible auto-applied maintenance changesets (T061) and/or a digest the user can
  skim, each item independently undoable.
- Keep it conservative — propose small, high-confidence maintenance, not sweeping rewrites.

## Acceptance Criteria

- On a deliberately messy state, the organizer surfaces real, correct maintenance actions.
- Every action is independently reversible (T061).
- It does not churn a clean, well-organized store.
- Rubric scenarios for organizer quality added to the quality harness (T067).

## Implementation Notes

- Depends on T061 (undo) and benefits from T064 (backlog ops).
- Supersedes/extends T020. Trigger options: on app open, on a schedule, or on demand — decide
  during implementation.
