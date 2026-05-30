# T052: AI Inbox Revision Flow

Status: implemented in V1 foundation.

## Goal

Let the user correct or refine AI-created drafts in natural language after the first capture.

## Scope

- Add an endpoint for follow-up messages on an existing capture session.
- Let follow-ups revise pending drafts, task metadata, or clarification answers.
- Keep revisions auditable in the session message history.
- Avoid silently overwriting completed/applied work without confirmation.

## Acceptance Criteria

- The user can say "actually make that next week" in the same session.
- The user can correct project/category placement.
- The session history explains what changed.
