# T007: Implement AI Validation And Apply Pipeline

## Goal

Connect inbox input to server-side structured AI output, validation, safe application, proposals, and audit logs.

## Scope

- `POST /inbox/items`
- `POST /ai-actions/{id}/confirm`
- `POST /ai-actions/{id}/reject`
- AI action log writes
- Transactional application for safe actions

## Requirements

- The model never mutates data directly.
- Safe actions auto-apply only after schema, ownership, date, and risk validation.
- Confirmation-required actions are stored as proposals.
- Revalidation runs again on confirmation.
- Every action writes an audit row.

## Acceptance

- Input like "Need back rehab daily and message Will today" creates a routine/task or proposals.
- Ambiguous dates produce clarification instead of unsafe scheduling.
- Moving deadlines requires confirmation.
- Audit screen can display action status and applied record refs.

