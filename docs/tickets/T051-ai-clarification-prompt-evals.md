# T051: AI Clarification Prompt Evals

Status: implemented in V1 foundation.

## Goal

Test that the live model asks fewer, better questions.

## Scope

- Add fixture and live eval cases for over-questioning.
- Add messy multi-turn inputs where the right behavior is to infer silently.
- Add cases where not asking would create bad state.
- Report whether each question was blocking, optional, or suppressed.

## Acceptance Criteria

- Live eval catches low-value follow-ups for obvious tasks.
- Live eval catches missing follow-ups for broad/vague tasks.
- Static fixture and live paths assert the same product policy.
