# T074: Auto-Organizer Enable/Disable Setting

Status: planned.

Follow-up to T069 (auto organizer runs once/day with no user control).

## Goal

Let the user turn the once-per-day auto organizer on or off.

## Scope

- `AppState` setting (e.g. `autoOrganizeEnabled`, default true).
- `maybeRunDailyOrganizer` respects it (no-op when disabled).
- A way to set it (endpoint / structure setting), surfaced in Planning preferences.

## Acceptance Criteria

- Disabling it stops the on-open auto pass; enabling resumes it. Default on.

## Notes

Backend setting + wiring is functional; the toggle control in Planning preferences is light UI.
