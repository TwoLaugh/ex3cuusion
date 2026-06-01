# T063: Week-Level Planning Actions

Status: implemented.

## Implementation

- The model already receives the full week plan (per-day plans with capacity + backlog with
  efforts) and `schedule_task` already assigns a task to any day — so this is a prompt
  capability, not new plumbing. Added instruction: for week-level requests (plan my week,
  rebalance, behind/ahead), distribute this-week/deadline/backlog tasks across days with one
  `schedule_task` per task, respecting each day's remaining capacity and deadlines, and allowing
  moves between days.
- Auto-applied; the whole re-plan is one undo snapshot (T061, recorded at submitInbox start).
- Verified live: `week-plan` quality scenario passes 3/3 (model produces a multi-day spread);
  full dev set 10/10 met threshold (no regressions). tsc + 45 unit tests green.

## Goal

Give the AI the ability to plan and rebalance the whole week, not just edit one task at a time.

## Scope

- New AI write operation(s) to:
  - distribute this-week / deadline / selected-backlog tasks across the days of the week within
    each day's capacity;
  - move tasks between days;
  - rebalance when the user is ahead/behind ("I'm slammed Monday, spread it out").
- Respect capacity, deadlines, fixed anchors, and existing day plans.
- Auto-apply with undo (each week re-plan is one reversible changeset, T061).

## Acceptance Criteria

- "Plan my week" lays tasks across days respecting capacity and deadlines, leaving fixed anchors
  intact.
- "I'm behind, rebalance the rest of the week" redistributes remaining work sensibly.
- The whole re-plan is a single undo (T061).
- Rubric scenarios added to the quality harness (T067).

## Implementation Notes

- Builds on the existing `weekPlan` read model and capacity scoring.
- Depends on T061 (undo) — do not auto-apply multi-day moves without it.
- Keep one full-context interpreter (AGENTS.md): week actions are additional action types, not a
  second interpreter.
