# T078: Post-Action Toasts (with Undo)

Status: planned (UI polish).

## Goal

After an auto-applied change (AI inbox, organizer, manual edit), show a transient toast
summarizing what happened with an inline Undo — so auto-apply feels safe and visible.

## Scope

- A toast surface that reads the latest change-history entry and offers Undo (POST /api/history).
- Auto-dismiss; stack briefly if several occur.

## Acceptance Criteria

- Applying an AI action or running Tidy-up shows a toast like "Archived 1 duplicate — Undo".

## Status: DONE (2026-06-10, branch daily-driver-polish)
