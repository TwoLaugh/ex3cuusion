# T070: Full Manual Task-Field Parity

Status: planned.

## Goal

Everything the AI can set on a task is also user-editable from the UI — no AI required.

## Current state

The Tasks-panel inline editor already exposes: title, domain, project, status,
priority/importance/urgency, effortMinutes, dueDate, scheduledDate, scheduledTime,
completionBehavior, completionMode, definitionOfDone, notes. The structure mutation backend also
already handles energy, strictness, and repeatPolicy.

## Gaps (AI can set, user cannot)

- `energy`, `strictness` — handled by backend, missing from the editor UI.
- `tags` — not editable in UI and not handled by the structure mutation.
- `scheduling` mode (exclusive / concurrent / background) — only the AI sets it (shown as a badge).
- `dateIntent` / "someday" — manual editing only sets raw dates; no someday / week-window control.
- `minMinutes` / `maxMinutes` (timebox range) — no control.
- `repeatPolicy` — backend handles it, no task-level UI control.

## Scope

- Extend the task structure mutation to accept `tags`, `scheduling` mode, `dateIntent`/someday,
  and min/max minutes.
- Add UI controls for energy, strictness, tags, scheduling mode, repeat policy, min/max, and a
  someday/this-week/next-week quick control — grouped under an "Advanced" section so the common
  editor stays simple.

## Acceptance Criteria

- A user can set every task field the AI can, entirely from the UI.
- Round-trips through Postgres unchanged.

## Open decision

Whether to keep three separate 1–10 scores (priority/importance/urgency) or lead with one
effective priority and tuck the components under "Advanced" (see UI notes).
