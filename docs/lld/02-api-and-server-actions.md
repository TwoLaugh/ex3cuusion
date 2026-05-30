# LLD: API And Server Actions

## Goal

Expose a web-first V1 backend that supports Today, AI inbox capture, planning, completion, deferral, review, and secondary admin screens behind the burger menu.

Server actions may be used by a colocated web framework, but each action should map cleanly to an HTTP endpoint so Android V1 can reuse the contract later.

## Cross-Cutting Rules

- All routes require `user_id` from auth/session.
- AI calls are server-side only.
- Mutations return the changed resource plus any planner warnings.
- Idempotency key is required for AI apply and plan generation requests.
- Validation failures return field-level errors and no partial writes unless the endpoint explicitly documents a transaction boundary.

## Today

### `GET /plans/today?date=YYYY-MM-DD`

Returns the active `day_plan` for the date. If none exists, return `404` with `can_generate: true`.

Response includes:

- plan header: date, load level, available minutes, estimated minutes, AI summary
- sections: routines, main blocks, quick tasks, soft invitations, later/deferred
- each item: id, type, title, estimate, status, linked ids, selected subtasks for project blocks

### `POST /plans/today/generate`

Creates or replaces a draft/active plan for a date.

Request:

- `date`
- `available_minutes` optional
- `energy` optional: low, medium, high
- `replace_existing` boolean

Server flow:

1. Load planning inputs.
2. Run deterministic planner.
3. Request AI rationale and optional qualitative adjustments.
4. Validate capacity and selected IDs.
5. Persist `day_plans` and `plan_items` in one transaction.

### `POST /plan-items/{id}/complete`

Completes a Today item.

Request:

- `actual_minutes` optional
- `complete_selected_subtasks` boolean for project blocks
- `completed_task_ids` optional
- `notes` optional

Effects:

- mark plan item done
- create completion event
- complete linked task or selected project subtasks when requested

### `POST /plan-items/{id}/defer`

Defers a Today item. Reason is mandatory.

Request:

- `reason`
- `note` optional
- `deferred_to` optional

Effects:

- create deferral log
- mark plan item deferred
- update linked task scheduling when applicable
- return planner calibration hint if repeated overplanning or vagueness is detected

### `POST /plans/today/replan`

Regenerates remaining incomplete items for the current day.

Requires confirmation when:

- replacing more than three items
- removing strict items
- moving deadlines

## AI Inbox

### `POST /inbox/items`

Stores raw input and asks AI for structured actions.

Request:

- `raw_text`
- optional `current_plan_date`

Response:

- inbox item
- assistant summary
- safe actions applied
- proposed actions needing confirmation
- clarification question if needed

### `POST /ai-actions/{id}/confirm`

Applies a proposed action after user confirmation. Revalidate payload and risk before applying.

### `POST /ai-actions/{id}/reject`

Marks a proposal rejected with optional reason.

## Admin Resources

These power burger-menu secondary screens. They are not the primary daily workflow.

- `GET/POST/PATCH /domains`, `POST /domains/{id}/archive`
- `GET/POST/PATCH /projects`, `GET /projects/{id}`, `POST /projects/{id}/archive`, `POST /projects/{id}/ai-refine-next-actions`
- `GET/POST/PATCH /tasks`, `POST /tasks/{id}/complete`, `POST /tasks/{id}/defer`, `POST /tasks/{id}/archive`
- `GET/POST/PATCH /routines`, `POST /routines/{id}/pause`

## Reviews

### `POST /reviews/daily/start`

Returns a terse review prompt using today's completion and deferral data.

### `POST /reviews/daily/submit`

Request:

- `date`
- `energy`
- `what_slipped`
- `planner_notes`
- optional planning preference updates

Effects:

- store review
- update `planning_context.recent_capacity_json`
- create AI action proposals for stale tasks or recurring overload if needed

### `POST /reviews/weekly/submit`

V1 weekly update endpoint for domain weights, project status, and stale-task pruning proposals.

## Audit And Debug

- `GET /ai-actions`: burger-menu audit screen for structured actions, validation status, and applied references.
- `GET /planner/debug?date=YYYY-MM-DD`: development-only candidate scores, capacity calculation, pruning decisions, and selected project subtasks.

