# T029: AI Capture Prompt And Schema Upgrade

## Goal

Upgrade the AI capture prompt and structured response schema so the model fills the richer task/container design and asks clarifying questions when needed.

## Scope

- Update model instructions for task, container, routine/repeatable, suggestion, and execution-outcome concepts.
- Add response fields for rich task metadata.
- Add confidence and uncertainty fields.
- Add clarification-question output.
- Add realistic fixtures for deterministic tests.

## Required Output Fields

Task/action payloads should support:

- `completionBehavior`
- `completionMode`
- `definitionOfDone`
- `repeatPolicy`
- `plannerFields`
- `plannerSignals`
- `tags`
- `fieldConfidence`
- `projectId` / container assignment
- `blocked`
- `waiting`
- `delegation`
- `minMinutes`, `maxMinutes`, `estimateConfidence`

## Prompt Rules

- Infer obvious structure silently.
- Ask one clarification when ambiguity would create bad state.
- Prefer reusable suggestions for ideas like date activities, books to read together, or things to try.
- Prefer progress/timebox semantics for broad work like "work on product for 2 hours".
- Prefer splitting or definition-of-done clarification for broad outcome work like "clean house" or "fix backend".
- Never create duplicates when an existing task/container matches.

## Acceptance Criteria

- Fixture interpreter and live-model path share the same schema expectations.
- Tests assert structured output for:
  - "cut nails"
  - "clean the house"
  - "work on diet app for two hours"
  - "message Will every Friday"
  - "ideas for things to do with Emma"
  - "waiting on Sam for the invoice"
- Invalid model output is rejected with useful validation errors.

## Non-Goals

- optimizing model choice
- multi-agent planning
- fully autonomous daily review
