# T020: V2 Proactive Structure Hygiene

## Goal

Let the AI periodically inspect tasks, containers, repeatables, and suggestion pools, then ask small targeted questions to keep the system from going stale.

This is V2 because the V1 model and capture flow need to settle first.

## Behavior

The AI reviews:

- stale tasks
- vague tasks
- containers with no next action
- repeatedly deferred items
- repeatable suggestions that are never used
- completed suggestions that should stay available
- overloaded containers
- task estimates that are consistently wrong

Then it generates one or a few useful questions.

Examples:

- "Diet App has no clear next action after the auth work. Want to define one?"
- "You deferred garage work three times as overplanned. Should I reduce the default block?"
- "These relationship ideas have not been suggested in a month. Keep them?"
- "This task has been active for 24 days with no plan item. Archive, split, or schedule it?"

## Cadence

Possible cadences:

- daily after review
- weekly planning
- when a container becomes stale
- when repeated deferrals create a pattern

## Acceptance Criteria

- AI can generate structure-hygiene questions from existing state.
- Questions are tied to concrete proposed actions.
- User can accept, reject, or postpone each question.
- Hygiene questions do not crowd out Today execution.
- Tests cover stale task, vague task, overplanned container, and repeatable suggestion cases.

## Non-Goals

- motivational coaching
- biography or journaling
- multi-user behavior
- adversarial productivity nagging
