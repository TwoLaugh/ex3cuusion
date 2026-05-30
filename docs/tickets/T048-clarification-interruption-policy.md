# T048: Clarification Interruption Policy

Status: implemented in V1 foundation.

## Goal

Make the AI think through ambiguity before interrupting the user. A follow-up question should appear only when the answer materially changes storage, scheduling, recurrence, completion behavior, project placement, or planner quality.

## Scope

- Add a server-side materiality policy for clarification questions.
- Preserve model questions that are worth asking.
- Suppress low-value questions for obvious simple tasks.
- Convert suppressed clarification drafts into reasonable task actions when possible.
- Record why a question was worth asking for debugging and AI activity review.

## Acceptance Criteria

- "cut nails" does not ask a follow-up, even if the model tries to ask one.
- "clean house" can ask a definition-of-done question because the answer changes task shape.
- "ideas for things to do with Emma" can ask about reusable suggestion behavior.
- "sometime next week" should not ask for an exact date unless the user names a hard deadline need.
- Tests cover model over-questioning and valuable clarification preservation.
