# T031: Realistic AI Capture Test Suite

## Goal

Build tight tests that mimic real user behavior around messy capture, clarification, task structuring, and planner outcomes.

These tests should protect the product semantics, not just endpoint mechanics.

## Scope

- Unit tests for schema validation and clarification decisions.
- State tests for session lifecycle and answer-apply behavior.
- Planner tests for resulting task/project/routine/suggestion behavior.
- E2E tests for realistic inbox usage.
- Fixture interpreter cases for deterministic AI tests.

## Real-Style Test Scenarios

Cover inputs like:

- "cut nails"
- "clean the house this weekend"
- "work on diet app for 2 hours"
- "message Will every Friday"
- "waiting on Sam for the invoice"
- "ideas for things to do with Emma"
- "read together sometime"
- "sort backend and storage"
- "I did part of garage but got tired"
- "move the auth bug to tomorrow, not urgent anymore"

## Assertions

Tests should verify:

- obvious tasks do not trigger annoying clarification
- vague tasks trigger useful clarification or splitting
- reusable suggestions do not disappear forever after completion
- repeatable tasks create the correct recurrence
- broad work gets timebox/progress semantics where appropriate
- waiting/blocked captures affect planner visibility correctly
- duplicates are not created after clarification
- applied actions are traceable to capture sessions
- Today shows completed/not-done items instead of disappearing them

## Acceptance Criteria

- Test fixtures cover every clarification type.
- E2E includes at least three multi-turn capture sessions.
- E2E verifies final UI state, not only debug JSON.
- Unit/state tests run without live OpenAI calls.
- A small optional live-model smoke test can be run manually behind an env flag, but is not required in CI.
