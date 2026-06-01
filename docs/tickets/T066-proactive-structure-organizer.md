# T066: Proactive Structure / Hygiene Organizer

Status: planned.

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
