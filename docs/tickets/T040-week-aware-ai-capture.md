# T040: Week-Aware AI Capture

Status: implemented in V1 foundation.

## Goal

Teach AI capture to preserve week/date wording without flattening everything into Today.

## Scope

- Update capture prompt guidance for exact dates, deadlines, and week windows.
- Add deterministic normalization for common relative date phrases.
- Split date intent per action when one inbox message contains multiple tasks.
- Extend fixture and eval coverage for mixed today/future wording.

## Acceptance Criteria

- Done: mixed today/future wording creates separate date intent for each task.
- Done: "finish auth bug by Tuesday" becomes a deadline.
- Done: "call dentist on Tuesday" becomes a specific scheduled date.
- Done: fixture evals assert date-intent behavior.

## Implementation Notes

- The eval uses "text Alex today and book dentist sometime next week" to avoid colliding with the seeded "Message Will" task.
- The prompt now tells the live model not to invent exact dates for broad week windows.
- Deterministic normalization protects common relative date phrases even when the model output drifts.
