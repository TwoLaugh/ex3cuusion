# T050: Clarification Session Memory

Status: implemented in V1 foundation.

## Goal

Store enough context in capture sessions for the AI to revise draft tasks rather than creating duplicates.

## Scope

- Store assistant reasoning summaries, question materiality, and draft action state.
- Track answered fields separately from unresolved fields.
- Support multiple user messages in one session.
- Keep session data structured enough for later Postgres persistence.

## Acceptance Criteria

- Session debug state shows messages, questions, answers, draft actions, and applied actions.
- Answers patch the original draft action.
- Repeated answers do not create duplicate tasks.
