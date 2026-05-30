# T032: Static Live AI Capture Evals

## Goal

Add a gated eval runner for single-turn messy AI inbox inputs.

The runner should exercise the real app API and report whether model output matches product semantics before state is trusted.

## Scope

- Add static eval scenarios for 20-30 messy inputs.
- Run against fixture mode by default.
- Run against the live model only when explicitly requested and `OPENAI_API_KEY` is present.
- Report pass/fail by scenario, including action type, model, task fields, questions, and resulting plan visibility.

## Static Scenario Themes

- obvious simple tasks
- broad work needing clarification
- timeboxed project work
- recurring habits
- reusable relationship ideas
- waiting/blocked captures
- sleep and hard anchors
- mixed multi-action messages

## Acceptance Criteria

- `npm run eval:ai` runs without live OpenAI calls.
- `npm run eval:ai:live` runs live-model smoke checks when `OPENAI_API_KEY` is set.
- Failures explain which expected semantic was missing.
- The script avoids printing secrets.
