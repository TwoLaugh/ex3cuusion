# T060: Live Current Time

Status: planned.

## Goal

The app reflects the user's real local current date and time, not a value frozen when the
server process first created state. The day and week plans must be anchored to "now."

## Problem

`state.currentTime` / `currentDate` are set once from `new Date()` at seed creation and never
updated, so the app shows whatever time the server started at. `toDateOnly` also uses
`toISOString()` (UTC), so the date can be off by one near midnight for non-UTC users.

## Scope

- On app load and on a recurring tick (~60s), the client sends its real local date and time to
  `/api/time` so state tracks actual now.
- Use local date (not UTC) when deriving the date-only string.
- Preserve the manually controllable clock for evals/tests (they set time explicitly and do not
  run the client tick — no conflict).
- Ensure the planner and timeline read the live `currentTime`.

## Acceptance Criteria

- Opening the app shows the actual local time; the "now" marker and day plan align with it.
- Crossing midnight rolls the date.
- Evals/tests still control time deterministically via `/api/time`.

## Implementation Notes

- Client-driven sync is the source of truth for real use (the browser knows the user's local
  clock and timezone); the seeded time is only a fallback.
- Keep the change isolated to time sync + date helper; do not couple it to AI logic.
