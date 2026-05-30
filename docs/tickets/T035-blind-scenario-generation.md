# T035: Blind Scenario Generation

## Goal

Generate realistic messy eval scenarios without overfitting to the current app schema.

Use a blind prompt or sub-agent style process that asks for natural user behavior, not expected system fields.

## Scope

- Prompt a separate generator to create difficult-day inputs.
- Include interruptions, fatigue, social obligations, vague work, date ambiguity, and partial progress.
- Convert generated strings into eval scenarios manually or through a review step.

## Acceptance Criteria

- Scenario generation prompt does not reveal the current implementation schema.
- Generated cases include at least 10 surprising but realistic strings.
- Added scenarios are reviewed into deterministic expectations before becoming regression tests.
