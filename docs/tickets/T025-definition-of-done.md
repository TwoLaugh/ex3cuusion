# T025: Definition Of Done

## Goal

Support optional completion criteria for tasks where "done" is ambiguous.

The app should not ask for this on every task. It should infer or ask only when ambiguity would cause bad planning or repeated partial completion.

## Model

Add optional fields:

- `completion_mode`
- `definition_of_done`

Candidate completion modes:

- `simple_done`
- `outcome_done`
- `timebox`
- `repeatable_checkoff`
- `progress_accumulating`
- `suggestion_used`

Examples:

- `Cut nails`: simple done, no clarification needed.
- `Clean house`: progress accumulating or split-needed if repeatedly deferred.
- `Finish auth bug`: outcome done, "fixed and verified".
- `Work on writing`: timebox or output, "45 minutes or next draft".
- `Read together`: suggestion used, remains available later.

## AI Behavior

Do not ask upfront by default.

Ask only when:

- task is too vague to plan safely
- task repeatedly gets partial completion
- task is a project/container block being mistaken for a task
- user asks what counts as done
- completion would have important downstream consequences

## Acceptance Criteria

- Task model includes optional completion mode and definition of done.
- AI action schemas can include these fields.
- Completion flow can use completion mode to decide whether to exhaust, keep active, or create follow-up.
- Tests cover simple done, outcome done, timebox, progress accumulating, and suggestion used.

## Non-Goals

- requiring completion criteria for every task
- heavy task-creation forms
- automated verification of external work
