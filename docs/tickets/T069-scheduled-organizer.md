# T069: Scheduled / Auto-Triggered Organizer

Status: implemented.

Follow-up to T066 (which is on-demand only).

## Implementation

- `AppState.lastAutoOrganizeDate`; `maybeRunDailyOrganizer()` (state.ts) runs the organizer only
  if it has not run for the current date, then stamps it. Recorded as "Daily tidy-up (auto)"
  (undoable via T061).
- `POST /api/organizer { auto: true }` runs the guarded version; the client calls it on mount
  after the clock sync.
- Verified: unit test (runs once, second same-day call is a no-op) + HTTP (dedup once, stamps
  date, no-op on second call). tsc + 49 unit tests green.
- A user-facing on/off toggle is left as a later addition; default is on, conservative, undoable.

## Goal

Run the conservative organizer pass automatically — at most once per local day, on app open —
so the system stays tidy without the user remembering to press "Tidy up".

## Scope

- Track the last auto-organize date in state; run the pass on app open only if it has not run
  for the current date, then stamp it.
- The auto pass uses the same conservative organizer and is recorded as a distinct, undoable
  "organizer (auto)" change (auto-apply with undo).
- Cheap: the once-per-day guard means at most one model call per day from this trigger.

## Acceptance Criteria

- Opening the app on a new day triggers exactly one auto organizer pass; opening again the same
  day does not re-trigger.
- The auto pass is conservative and fully reversible via the undo/history layer (T061).

## Implementation Notes

- `AppState.lastAutoOrganizeDate`; `maybeRunDailyOrganizer()` in state.ts guards on it.
- `POST /api/organizer { auto: true }` runs the guarded version; the client calls it on mount
  after the clock sync.
- A user-facing on/off toggle can be added later; default behaviour is on, conservative, undoable.
