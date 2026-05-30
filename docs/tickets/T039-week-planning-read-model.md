# T039: Week Planning Read Model

## Goal

Create a week-level read model before committing to the storage migration.

## Scope

- Build a Monday-start seven-day plan view from existing daily planning.
- Add week backlog buckets for this week, next week, and someday.
- Keep week-window tasks out of exact daily plans until they receive an exact date or planner decision.
- Expose a `/api/week` endpoint.

## Acceptance Criteria

- `/api/week` returns seven daily plans.
- Week-window tasks appear in the correct week backlog.
- Exact scheduled tasks still appear on their day.
- The read model is derived from current state and does not mutate tasks.
