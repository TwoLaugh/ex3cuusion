# T028: Capture Answer And Apply API

## Goal

Add backend endpoints for answering AI clarification questions and applying the resulting structured changes.

This ticket connects the capture-session model to actual mutations of tasks, projects/containers, routines, suggestions, and refinement proposals.

## Scope

- `POST /api/capture-sessions/:id/answer`
- `POST /api/capture-sessions/:id/dismiss`
- `POST /api/capture-sessions/:id/apply`
- Revalidation of patched AI actions before apply.
- Audit/event logging for answer, apply, reject, and dismiss.

## Requirements

- The model never mutates data directly.
- Every answer is validated and attached to a specific question.
- Applying after clarification re-runs schema validation, foreign-key validation, and risk classification.
- Duplicate prevention still applies after answers patch actions.
- Dangerous or broad mutations still require explicit confirmation.
- A session can apply partially if only some questions are resolved.

## Acceptance Criteria

- Answering "weekly" to a routine clarification creates/patches the repeat policy.
- Answering "Emma ideas, keep reusable" creates/patches a reusable suggestion in the correct container.
- Answering a definition-of-done question updates the pending task before apply.
- Rejecting/dismissing a session preserves an audit trail.
- Tests cover valid answer, invalid answer, duplicate-prevention after answer, partial apply, and rejected session.
