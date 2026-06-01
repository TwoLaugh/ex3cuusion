# T074: Explicit Organizer Control

Status: revised.

The first implementation added an auto-organizer enable/disable setting. After dogfooding, the
better V1 behavior is simpler: do not auto-run the organizer; provide an explicit button.

## Implementation

- Removed the client-side page-load call to `POST /api/organizer { auto: true }`.
- Kept the AI inbox "Tidy up" button.
- Added an explicit "Run tidy-up" button in Planning preferences.
- The backend guarded auto route remains available for future scheduling experiments, but it is not
  used by the V1 UI.

## Goal

Make organizer actions intentional. No API spend and no real state mutation should happen merely
because the user opened the app.

## Acceptance Criteria

- Loading the app only syncs the clock.
- User-visible tidy-up buttons run the organizer on demand.
- The resulting organizer pass is still undoable.
