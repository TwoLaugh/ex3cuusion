# T026: Capture Session Storage

## Goal

Persist AI inbox conversations as structured capture sessions rather than isolated one-shot inbox entries.

The session is not long-term chat memory. It is a temporary intake workspace that turns messy user input into durable tasks, containers, routines, suggestions, and refinement proposals.

## Scope

- Add `CaptureSession` state/model.
- Link inbox entries and AI actions to a session.
- Store user messages, AI questions, answers, proposed actions, applied actions, rejected actions, and unresolved fields.
- Preserve raw user wording for audit/debug.
- Keep session history bounded and structured.

## Suggested Model

`CaptureSession` should include:

- `id`
- `status`: `open | waiting_for_user | applied | dismissed`
- `createdAt`
- `updatedAt`
- `source`: `inbox | not_done | daily_review`
- `messages`
- `questions`
- `answers`
- `actionIds`
- `unresolvedFields`
- `summary`

## Requirements

- Existing one-shot inbox behavior keeps working.
- Every AI-created or AI-proposed action can be traced back to the session/message that produced it.
- Sessions can survive partial completion: one action may apply while another waits for clarification.
- Session state must be serializable by the current repository layer.
- Keep old state files/backward compatibility safe by normalizing missing session arrays.

## Acceptance Criteria

- Creating an inbox message creates or appends to a capture session.
- Applied actions retain session/message references.
- Pending actions remain visible when a session is waiting for clarification.
- Reset/debug endpoints include capture sessions.
- Unit tests cover new session creation, append behavior, partial application, and old-state normalization.

## Non-Goals

- general-purpose assistant memory
- auth-scoped sessions
- streaming chat UI
