# T011: Build Daily Review Flow

## Goal

Add a short review flow that turns execution outcomes into planner calibration data.

## Scope

- Review entry from Today header
- `POST /reviews/daily/start`
- `POST /reviews/daily/submit`
- Review storage
- Optional AI interpretation proposals

## Requirements

- Questions remain short and execution-focused.
- Capture energy, slipped items, overplanning/vagueness, and tomorrow adjustments.
- Do not introduce journaling, biography, therapy, or coaching prompts.

## Acceptance

- Review can be completed in under a minute.
- Submitted review updates planner context.
- AI can propose task splits or pruning from review data, subject to validation.

