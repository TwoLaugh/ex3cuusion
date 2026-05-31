# T059: Model-Owned Day Patch

Status: proposed.

## Goal

Move AI inbox edits away from brittle intent-specific deterministic handlers and toward a model-owned day/state patch flow.

## Scope

- Send the model the current day plan plus relevant structured state as JSON.
- Send the user inbox request or follow-up message.
- Ask the model to return a complete proposed patch for the affected day and entities.
- Validate the patch before applying it.
- Show a concise summary of what changed.
- Keep deterministic code as validation, conflict detection, and safety guardrails rather than the primary interpretation layer.

## Acceptance Criteria

- Requests like "move the dump run earlier", "remove the old duplicate", and "combine cut nails and shower" are handled as state edits, not accidental new task creation.
- The model can archive, update, merge, reschedule, and preserve tasks in one response.
- Validation rejects impossible states: missing IDs, invalid times, duplicate IDs, completed tasks being silently deleted, and schedule collisions that violate strict anchors.
- Tests compare before-state, user request, model patch, final state, and visible Today output.
- The prompt explicitly asks the model to reason over current state first, then output only the patch JSON.

## Implementation Notes

- This likely replaces or wraps much of the current `deterministicExistingTaskActions` behavior.
- Keep action-level audit logs, but let one model patch contain multiple edits.
- Start with current-day JSON plus task/project summaries before expanding to full week state.
- For V1 dogfooding, allow fixture tests and a live eval set with messy edit requests.
