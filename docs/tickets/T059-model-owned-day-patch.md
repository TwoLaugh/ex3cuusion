# T059: Simple Day-Rewrite Inbox

Status: in progress.

## Goal

Move current-day AI inbox edits away from brittle intent-specific deterministic handlers and toward a simple model-owned day rewrite.

## Scope

- Send the smart model the user request plus a simple current-day JSON list: task IDs, titles, start times, end times, and effort minutes.
- Ask the model to return the revised day in the same simple format, plus explicit archived task IDs and an optional question.
- Diff the revised day into app actions: schedule existing tasks, archive explicitly removed tasks, and create new same-day tasks.
- Fall back to the older full-context action interpreter only when the day rewrite produces no changes.
- Show a concise summary of what changed.
- Keep deterministic code as validation, application, and safety guardrails rather than primary interpretation.
- Avoid semantic normalization for day-rewrite outputs so backend heuristics do not override the model's revised day.

## Acceptance Criteria

- Requests like "move the dump run earlier", "remove the old duplicate", and "add clean house at 4" are represented as a revised day, not hand-parsed intents.
- The model receives exact task IDs and copies unchanged tasks through unchanged.
- The model can archive, reschedule, create, clarify, and preserve tasks in one response.
- Validation rejects impossible states: invalid times, archived/missing task IDs, and unsafe edits.
- Tests cover before-state, user request, model action JSON, final state, and visible Today output.
- The prompt explicitly asks the model to output only the revised day JSON.

## Implementation Notes

- This replaces the full-context-first live inbox experiment for day edits.
- Keep action-level audit logs by compiling the revised day into existing `AiAction`s.
- This is intentionally narrower than a full planner-state patch. Prove the model can build the visible day correctly first.
- For V1 dogfooding, allow fixture tests and a live eval set with messy edit requests.
