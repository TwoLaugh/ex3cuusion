# T027: Clarification Question Engine

## Goal

Let the AI ask useful clarifying questions when ambiguity would create weak planner state.

The system should not interrogate the user for obvious tasks. It should ask when the answer materially changes task structure, recurrence, completion behavior, scheduling, container placement, or definition of done.

## Scope

- Add typed clarification questions.
- Add server-side rules for when clarification is required vs optional.
- Let pending AI actions depend on answers.
- Let answers patch existing pending actions instead of creating duplicate tasks.

## Clarification Types

- `blocking`: required before applying a mutation.
- `optional`: action can apply, but quality improves if answered.
- `batch`: one question resolves several related captures.
- `refinement`: improves an already-created task/container after initial capture.

## Question Targets

Questions should primarily resolve:

- one-off vs repeating vs reusable suggestion
- project/container/category/person/list placement
- definition of done for vague work
- date/time ambiguity
- blocked/waiting/delegated status
- task splitting for broad work
- expected duration or timebox

## Requirements

- Prefer one strong question over many tiny questions.
- Do not ask for definition of done on obvious simple tasks such as "cut nails".
- Ask or infer for broad inputs such as "clean house", "work on product", "stuff for Emma", or "sort diet app".
- Clarifying answers must update the existing session/action.
- The user can skip/dismiss a clarification without losing the original capture.

## Acceptance Criteria

- Ambiguous capture creates a pending clarification rather than a low-quality task.
- Answering a clarification applies or updates the pending action.
- Skipping a clarification leaves the session inspectable and does not silently mutate state.
- Unit tests cover obvious task no-question, vague task question, date ambiguity, reusable suggestion, and container-kind ambiguity.
