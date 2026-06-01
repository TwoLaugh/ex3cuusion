# T069: Guarded Organizer Endpoint

Status: revised.

Follow-up to T066. The organizer remains available through a guarded endpoint, but the client no
longer runs it automatically on app open. Dogfooding showed that page-load AI spend and mutation is
too surprising for V1.

## Implementation

- `POST /api/organizer` runs the explicit tidy-up pass.
- `POST /api/organizer { auto: true }` still runs the once-per-day guarded backend path, but the
  UI does not call it on mount.
- The app syncs the live clock on load, then waits for the user to press a tidy-up button.
- Organizer changes remain undoable through the history layer.

## Goal

Keep the conservative organizer available without silently spending API credit or mutating the real
dogfood state when the app opens.

## Acceptance Criteria

- Opening the app does not call the organizer.
- Pressing a tidy-up button runs one organizer pass.
- Organizer changes are still reversible via undo/history.
