# T022: Not Done Reason Flow

## Goal

Make the execution UI capture useful information when the user does not simply complete a task.

The main controls should stay simple, but `Not done` / `Defer` should open a small AI-assisted reason sheet.

## UX

Primary controls:

- Done
- Not done

`Not done` opens a compact sheet with quick choices:

- no energy
- no time
- blocked
- waiting on someone
- too vague
- did part
- not important
- moved intentionally
- other

Optional freeform note:

- "cleaned kitchen, hallway still bad"
- "waiting for Sam to send invoice"
- "too tired after work"

## Backend Behavior

Map reason to event/action:

- no energy -> execution event + planner calibration
- no time -> execution event + capacity calibration
- blocked -> mark blocked or create unblock action
- waiting on someone -> waiting state + follow-up date if known
- too vague -> mark needs split / create AI split proposal
- did part -> progress event + optional next action
- not important -> lower-priority/archive proposal
- moved intentionally -> reschedule/defer event

## Acceptance Criteria

- UI supports a compact reason flow.
- Route accepts structured reason plus optional note.
- Reason creates the correct execution event.
- State/planner updates immediately after submit.
- Tests cover no energy, blocked, did part, too vague, and not important.

## Non-Goals

- long review workflow
- heavy forms
- requiring a note every time
