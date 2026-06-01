# T068: Guarded Live Clock Tick

Status: implemented.

Follow-up to T060 (which only synced the clock on mount).

## Implementation (page.tsx)

- `followingTodayRef` (default true; set true by `syncClock`). A 60s interval re-syncs to real
  local now only while following — advancing the clock and rolling past midnight.
- Prev/next day buttons set `followingTodayRef=false` so the tick does not yank navigation.
- A "Today" button (shown when not viewing today) resyncs and resumes following.
- Verified: page renders (SSR 200) with the changes; tsc + tests green. Client-only.

## Goal

Keep the app's time current while the user is viewing today — advancing the clock and rolling
past midnight — WITHOUT yanking the view back to today when the user has navigated to another day.

## Scope

- A periodic tick (~60s) that re-syncs the app to real local now ONLY while the user is
  "following today".
- Manual day navigation (prev/next) turns following off, so the tick does not pull them back.
- A way to return to today and resume following (a "Today" control).

## Acceptance Criteria

- Left open on today, the displayed time advances and the date rolls at midnight.
- After navigating to another day, the tick does not move the view.
- A "Today" control returns to today and resumes auto-following.

## Implementation Notes

- Client-only (page.tsx): a `followingToday` ref, an interval, prev/next set it false, a Today
  button resyncs and sets it true. No server change.
