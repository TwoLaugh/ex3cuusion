# LLD: AI Actions And Validation

## Goal

Make AI central to capture, organization, planning, and review while ensuring the model never directly mutates the database.

## Flow

```text
raw input
-> inbox item
-> server-side structured AI call
-> schema validation
-> risk classification
-> safe auto-apply or proposal
-> audit log
-> concise UI summary
```

## Structured Action Envelope

```json
{
  "action_type": "create_task",
  "confidence": 0.86,
  "reason": "User explicitly asked to message Will.",
  "payload": {}
}
```

Required envelope validation:

- known `action_type`
- confidence `0..1`
- payload matches action schema
- referenced IDs belong to current user
- dates are explicit or safely inferred from current date/timezone
- destructive or high-impact changes are not auto-applied

## V1 Action Types

Safe by default when payload is valid:

- `create_task`
- `create_project`
- `create_routine`
- `add_project_note`
- `assign_task_to_project`
- `assign_task_to_domain`
- `schedule_task`
- `schedule_project_block`

Confirmation required:

- `archive_task`
- `archive_project`
- `move_deadline`
- `change_routine_recurrence`
- `mark_task_done`
- `replace_today_plan`
- `bulk_update_tasks`
- `lower_priority_or_prune`

Non-mutating:

- `ask_clarification`
- `propose_task_split`
- `summarize_today`
- `interpret_review`

## Example Payloads

### create_task

```json
{
  "title": "Message Will",
  "description": null,
  "domain_name": "Social Maintenance",
  "project_name": null,
  "due_on": null,
  "scheduled_for": "2026-05-29",
  "effort_minutes": 5,
  "energy_required": "low",
  "strictness": "flexible",
  "priority": 3,
  "importance": 3,
  "urgency": 3
}
```

### create_routine

```json
{
  "title": "Back rehab",
  "domain_name": "Health Repair",
  "recurrence_rule": "FREQ=DAILY",
  "default_effort_minutes": 15,
  "energy_required": "low",
  "strictness": "strict",
  "preferred_window": "morning"
}
```

### schedule_project_block

```json
{
  "project_name": "Diet App",
  "date": "2026-05-29",
  "minutes": 120,
  "focus": "Finish auth bug and add optimizer tests",
  "candidate_task_titles": [
    "Fix auth bug",
    "Add optimizer tests"
  ]
}
```

## Validation Rules

- "today", "tomorrow", and weekdays resolve in the user's timezone.
- Ambiguous dates require clarification.
- Moving a due date requires confirmation.
- Prefer exact active project/domain match.
- If no match exists, safe actions may create a domain/project when the name is explicit.
- Fuzzy matches below confidence threshold require confirmation.
- Reject empty, motivational, or non-actionable task titles.
- Vague project work becomes `propose_task_split`, not a planned task.
- Effort over 4 hours should become a project block or split proposal.

## UI Contract

The AI inbox overlay shows one terse assistant summary, applied changes, proposals needing confirm/reject, and one clarifying question when blocked.

It should not show a long visible chat transcript by default.

## Audit

For every action, write an `ai_action_logs` row with raw payload, validation result, risk level, status, applied record references, and model name.

The audit screen is available from the burger menu for debugging and trust, not daily use.

