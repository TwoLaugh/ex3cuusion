# T090 — Committed day plan + explicit replan

User decision (2026-06-10): the plan should be MINE, not a perpetually
re-computed draft. buildDayPlan currently regenerates on every read, so the
day re-flows under the user as scores/time shift.

## Model
- `commitDayPlan()`: snapshot today's generated plan (items, order, times)
  into state (e.g. state.committedPlans[date]). While a commitment exists,
  the day view renders the committed plan with live status overlays
  (done/deferred/missed-by-clock), NOT a fresh buildDayPlan.
- First open of a day (or "Commit plan" button) creates the commitment.
- "Replan rest of day" = the ONLY reshuffler: regenerates remaining items
  (preserving done/locked anchors) and re-commits. AI replan actions go
  through the same gate. Each commit/replan is one undoable change.
- Late tasks don't silently vanish: items whose window passed stay visible
  as "missed" until acted on (done/defer/replan).

## Notes
- Keep buildDayPlan pure for generation; commitment is a stored projection.
- Week plan stays live (read model) for now.
- Evals/tests: planner tests target generation; add state tests for
  commit/replan/undo.
