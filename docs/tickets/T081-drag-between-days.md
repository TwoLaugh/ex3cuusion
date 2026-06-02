# T081: Drag-Between-Days (Week / Timeline)

Status: implemented (Today timeline; week-grid drag still a follow-up).

## Implementation

- Today timeline blocks are draggable; dropping on the calendar grid maps the drop Y to a 15-min
  slot and reschedules the task via the same /api/structure mutation the Move dialog uses
  (timeline now exposes startMinutes). Drag gesture needs browser confirmation; the reschedule
  call path is already verified.
- The Today drag interaction now uses pointer capture instead of the native browser drag ghost:
  dragged cards lift with a heavier shadow, a snapped-time placeholder follows the target slot,
  and neighbouring blocks animate out of the way while the task is being moved.
- Follow-up: drag a task between DAYS on the week view (this covered the Today timeline).

## Goal

Extend the T072 drag-and-drop pattern to the week view (drag a task between days) and the
timeline (drag to reschedule a time), reusing schedule_task / dateIntent mutations.
