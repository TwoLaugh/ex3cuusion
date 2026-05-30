# T030: AI Inbox Clarifying Chat UI

## Goal

Turn the AI inbox into a compact intake chat that can show clarifying questions, proposed changes, and applied results without exposing the full internal model.

## Scope

- Show capture sessions in the AI inbox.
- Show user messages, AI clarification questions, proposed actions, and applied/rejected actions.
- Let the user answer questions inline.
- Let the user dismiss or skip clarification.
- Keep Today uncluttered.

## UX Requirements

- The user should mostly type messy natural language.
- Clarification should feel like a small assist, not homework.
- Prefer quick answer controls when possible:
  - one-off / repeating / reusable
  - project / person / list / idea pool
  - today / date / someday
  - simple done / timebox / progress / suggestion
- Free-text answer must always be available.
- Show concise proposed outcomes before risky application.
- Do not show every backend field unless the user opens details/debug.

## Acceptance Criteria

- A vague inbox capture renders a question instead of silently failing.
- Answering the question updates the same session and applies or updates the proposed action.
- Applied changes are summarized in plain language.
- Dismissed questions remain auditable in AI Activity/debug.
- E2E tests cover a full session from messy input through clarification answer to visible Today/project state.

## Non-Goals

- full-screen chat product
- permanent conversational memory UI
- voice input
