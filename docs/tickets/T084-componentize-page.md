# T084: Componentize page.tsx

Status: planned (dev maintainability).

## Goal

Split the ~1,900-line `src/app/page.tsx` into focused components (Today, BacklogBoard, SecondaryPanel,
TaskEditor, InboxPanel, etc.) to reduce bug surface (e.g. the earlier staging miss) and ease future UI work.

## Acceptance Criteria

- Behaviour unchanged; tsc + tests + SSR render identical; files are smaller and focused.

## Status: DONE (2026-06-10, branch daily-driver-polish)
