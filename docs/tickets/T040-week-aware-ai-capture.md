# T040: Week-Aware AI Capture

## Goal

Teach AI capture to preserve week/date wording without flattening everything into Today.

## Scope

- Update capture prompt guidance for exact dates, deadlines, and week windows.
- Add deterministic normalization for common relative date phrases.
- Split date intent per action when one inbox message contains multiple tasks.
- Extend fixture and eval coverage for mixed today/future wording.

## Acceptance Criteria

- "message Will today and book dentist sometime next week" creates separate date intent for each task.
- "finish auth bug by Tuesday" becomes a deadline.
- "call dentist on Tuesday" becomes a specific scheduled date.
- Fixture evals assert date-intent behavior.
