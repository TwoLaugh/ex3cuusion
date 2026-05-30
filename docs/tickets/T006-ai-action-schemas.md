# T006: Define AI Structured Action Schemas

## Goal

Create typed schemas for AI actions used by inbox capture, planning, and review.

## Scope

Actions: create_task, create_project, create_routine, add_project_note, assign_task_to_project, assign_task_to_domain, schedule_task, schedule_project_block, archive_task, archive_project, move_deadline, change_routine_recurrence, mark_task_done, replace_today_plan, bulk_update_tasks, lower_priority_or_prune, ask_clarification, propose_task_split, summarize_today, and interpret_review.

## Requirements

- Use a common action envelope with action type, confidence, reason, and payload.
- Validate dates in the user's timezone.
- Include risk classification metadata.
- Keep schemas independent of a specific UI.

## Acceptance

- Invalid enum values, missing titles, invalid dates, and foreign IDs fail validation.
- Safe and confirmation-required actions can be classified without calling the model.
- Unit tests cover representative valid/invalid payloads.

