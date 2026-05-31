# T059: Full-Context Model-Owned Inbox

Status: in progress.

## Goal

Move AI inbox edits away from brittle intent-specific deterministic handlers and toward a single smart-model pass that receives enough state to decide what should change.

## Scope

- Send the smart model the user request plus full structured planner context: current state, current day plan, week plan, backlog, recent inbox, projects, tasks, routines, reviews, and execution history.
- Let the model decide whether to create, archive, reschedule, ask a clarification, or make several actions in one response.
- Validate the returned action JSON before applying it.
- Show a concise summary of what changed.
- Keep deterministic code as normalization, validation, application, conflict detection, and safety guardrails rather than primary interpretation.
- Do not introduce a routing model yet. Add routing/context selection later only if the full-context pass shows real cost, latency, or accuracy problems.

## Acceptance Criteria

- Requests like "move the dump run earlier", "remove the old duplicate", and "combine cut nails and shower" are handled as model-owned state edits, not accidental new task creation.
- The model can archive, reschedule, create, clarify, and preserve tasks in one response.
- The model receives exact task IDs and is prompted to target existing IDs for edits/removals.
- Validation rejects impossible states: missing IDs, invalid times, duplicate IDs, completed tasks being silently deleted, and schedule collisions that violate strict anchors.
- Tests cover before-state, user request, model action JSON, final state, and visible Today output.
- The prompt explicitly asks the model to reason over current state silently, ask only worthwhile questions, then output only structured JSON.

## Implementation Notes

- This replaces the current pre-model `deterministicExistingTaskActions` behavior for the main inbox path.
- Keep action-level audit logs, but let one model patch contain multiple edits.
- Start with the existing action schema plus `schedule_task` and `archive_task`; expand to richer whole-day/week patch objects only after dogfooding shows the action schema is too narrow.
- For V1 dogfooding, allow fixture tests and a live eval set with messy edit requests.
