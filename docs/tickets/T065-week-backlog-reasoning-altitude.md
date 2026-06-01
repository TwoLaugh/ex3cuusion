# T065: Week + Backlog Reasoning Altitude

Status: planned.

## Goal

Make the single interpreter reason fluidly across day / week / backlog and pick the right
altitude of action, instead of defaulting to day-level edits.

## Scope

- Ensure the interpreter's context surfaces the week plan, backlog, deadlines, and capacity in a
  form the model reasons over (it already receives these — verify and tighten).
- Prompt the model to choose week-level (T063) or backlog (T064) operations when the request is
  about the week or backlog, and to stay day-level for day requests.
- No second interpreter — extend the one full-context interpreter with the new action types
  (AGENTS.md: do not reintroduce competing interpreters).

## Acceptance Criteria

- Week/backlog requests yield week/backlog actions; day requests stay day-level; mixed requests
  are decomposed sensibly.
- No regression on existing day-level quality scenarios.
- Rubric scenarios covering altitude selection added to the quality harness (T067).

## Implementation Notes

- Depends on T063 and T064 (their action types must exist first).
- This is prompt + action-selection work, not new plumbing.
