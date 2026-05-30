# T018: AI Capture Sessions And Clarifying Chat

## Goal

Turn the AI inbox from one-shot parsing into a short structured intake conversation.

The AI should be able to ask clarifying questions, attach answers to pending actions, and apply safe structured changes once ambiguity is resolved.

## Model

Add a `CaptureSession` concept containing:

- raw user messages
- proposed AI actions
- clarifying questions
- user answers
- applied actions
- rejected actions
- unresolved fields

Clarification types:

- blocking clarification: required before mutation
- non-blocking clarification: action can apply, but refinement is useful
- batch clarification: several vague items can be reviewed together
- refinement: improves project/container/task quality after initial capture

## UX Rules

- Chat is an intake tool, not the main product surface.
- Resolved chat should collapse into structured state.
- Ask only when ambiguity would create bad state or useful refinement.
- Prefer one good question over many small ones.
- Let the user defer clarification without losing the raw capture.

## Acceptance Criteria

- Inbox entries can belong to a capture session.
- Pending actions can wait on clarifying answers.
- Clarifying answers patch existing pending actions instead of creating duplicate tasks.
- The UI shows concise questions and proposed/applied changes.
- Tests cover ambiguous date, vague project work, repeatable suggestion, and container-kind clarification.

## Non-Goals

- long-term chat memory
- open-ended life coaching
- storing full unbounded conversation history as core planner context
