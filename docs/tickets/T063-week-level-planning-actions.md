# T063: Week-Level Planning Actions

Status: planned.

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
