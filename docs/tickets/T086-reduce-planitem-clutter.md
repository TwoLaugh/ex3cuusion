# T086: Reduce Plan-Item Clutter

Status: implemented.

## Implementation

- Removed the generated `item.reason` subheading (e.g. "Small task with time pressure") from both
  the timeline and unscheduled Today cards. Title, time, meta badges, and status pill remain.

## Problem

Per-item rationale subheadings like "Small task with time pressure" read as clutter rather than
signal.

## Scope

- Remove (or hide behind detail/hover) the generated plan-item rationale lines and any other
  low-value subheadings on the Today cards.
- Keep genuinely useful info (title, time, effort, key badges); cut the rest.

## Acceptance Criteria

- Today cards are visually cleaner; no superfluous generated sentences by default.
