# T061: AI Change History and Undo

Status: implemented.

## Implementation

- `state.ts`: a process-level change-history stack kept OUTSIDE `AppState` (so it never leaks
  into model context). `recordChange(source, summary)` snapshots state before each AI op;
  `listChangeHistory()` returns metadata; `undoChange(id?)` restores the snapshot (LIFO rewind —
  undoing a change also reverts later ones). Hooked into `submitInbox`, `answerCaptureQuestion`,
  and `addCaptureSessionMessage`. `resetState` clears history.
- `GET/POST /api/history` (list / undo).
- `page.tsx`: a "Recent AI changes" strip with per-item Undo, refreshed after any state change.
- Verified: unit test (undo-last), HTTP flow (record + undo-last + undo-by-id rewind), page SSR
  renders, tsc + 44 unit tests green.
- Not yet: persistence to Postgres (in-memory/per-process only); manual plan outcomes are not
  yet in history (AI ops only, per scope).

## Goal

Make every AI-applied change reversible, so the system can auto-apply changes (the chosen
apply model) without the user losing trust. This is the safety net for all larger
week/backlog/organizer operations.

## Apply Model

Auto-apply with undo (decided): the AI applies changes immediately; the user relies on a
reliable per-operation undo rather than a confirm-before-apply gate.

## Scope

- Record each AI operation as a **changeset**: the group of entity mutations produced by one
  inbox submission, week re-plan, grooming action, or organizer pass. Capture before/after for
  each affected entity (create / edit / archive / move / split).
- API to list recent changesets and to undo a changeset (restores the prior entity states).
- UI surface: a "recent AI changes" list with an undo control per changeset.
- Undo is per-operation and order-aware (undo most recent first; guard against undoing a
  changeset whose entities were further changed).

## Acceptance Criteria

- After any AI inbox action or larger reorganization, the user can undo it and state returns to
  the pre-operation state.
- Works across action kinds: create_task, archive, schedule/move, project grouping, week
  re-plan, backlog grooming.
- Undo is reversible-safe (does not corrupt state if entities changed after the changeset).

## Implementation Notes

- No undo/history exists today — this is greenfield.
- Prerequisite for T063 (week planning), T064 (backlog grooming), T066 (organizer). Build it
  before auto-applying multi-entity changes.
- Model a changeset as `{ id, source, createdAt, entries: [{ entityType, entityId, before, after }] }`.
