# T049: AI Inbox Chat Sessions

Status: implemented in V1 foundation.

## Goal

Make the AI inbox behave like a compact capture conversation rather than a debug log.

## Scope

- Render capture sessions as chat-like user/assistant turns.
- Show pending questions inline with options and a short answer box.
- Keep applied actions visible as outcomes under the conversation.
- Let the user answer a clarification without losing context.
- Avoid exposing raw implementation fields in the primary inbox UI.

## Acceptance Criteria

- A capture with no follow-up reads as captured/applied, not as a wall of action metadata.
- A capture with one worthwhile question shows the assistant question as the main next step.
- Answering the question updates the same session.
- E2E covers a realistic multi-turn capture.
