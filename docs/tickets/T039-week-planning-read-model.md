# T039: Week Planning Read Model

Status: implemented in V1 foundation.

## Goal

Create a week-level read model before committing to the storage migration.

## Scope

- Build a Monday-start seven-day plan view from existing daily planning.
- Add week backlog buckets for this week, next week, and someday.
- Keep week-window tasks out of exact daily plans until they receive an exact date or planner decision.
- Expose a `/api/week` endpoint.

## Acceptance Criteria

- Done: `/api/week` returns seven daily plans.
- Done: week-window tasks appear in the correct week backlog.
- Done: exact scheduled tasks still appear on their day.
- Done: the read model is derived from current state and does not mutate tasks.

## Implementation Notes

- `buildWeekPlan` produces a Monday-start week from the current state.
- Backlog buckets currently cover this week, next week, and someday.
- This is intentionally a read model; it does not yet optimize or persist a full weekly schedule.
