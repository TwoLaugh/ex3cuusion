# T017: Rich Task Metadata

## Goal

Add the internal structure needed for AI-assisted planning without exposing a giant form to the user.

The model should support typed planner fields, planner signals, free tags, and confidence per inferred field.

## Fields To Design

Typed planner fields:

- intent type
- pressure level
- completion behavior
- repeat policy
- time policy
- time window
- estimate confidence
- energy required
- carryover policy
- blocked/vague state

Planner signals:

- avoidance risk
- momentum value
- relationship value
- deadline risk
- recovery value
- cognitive load
- setup cost
- location dependency

Free tags:

- loose search/grouping labels such as phone, laptop, outside, admin, creative, weekend, quick_win

Confidence:

- store AI confidence per important inferred field
- low-confidence fields should create clarification questions
- medium-confidence fields can be stored but marked adjustable
- high-confidence fields can be silently applied when safe

## Acceptance Criteria

- TypeScript task model includes typed planner fields, planner signals, free tags, and field confidence.
- AI action payloads can carry these fields.
- Server validation distinguishes typed fields from free tags.
- Tests cover high, medium, and low confidence inference.
- UI does not expose a large manual metadata form.

## Non-Goals

- final scoring weights
- full Postgres migration
- multi-user auth
