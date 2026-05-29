# Carry-Over Audit From c3Ntr0l

This repo starts fresh because the product direction has narrowed.

The old `c3Ntr0l` repo explored a broader context-led personal operating system. That direction is no longer the controlling implementation model.

## Likely Carry Over

These pieces are probably useful after review:

- FastAPI/Postgres project setup
- auth/session foundation
- local dev Docker setup
- OpenAPI export workflow
- AI action log pattern
- inbox route/service shape
- structured OpenAI response pattern
- Today route/service starting point
- daily review route starting point
- dark web shell styling direction
- proposal/confirmation flow for AI changes
- tests and migration test patterns

## Needs Refactor Before Carrying Over

- task/routine/project/domain models
- daily plan item model
- inbox intent schema
- planner service
- daily review service
- web Today UI
- web inbox overlay

These should be aligned to the execution-engine model before reuse.

## Probably Do Not Carry Over As Core

- context sections
- context section revisions
- context evidence links
- category/item abstraction as primary V1 model
- life-understanding/distillation services

These may remain useful as reference code but should not drive V1.

## Superseded Product Direction

Do not build:

- personal biography
- long-term self-understanding memory
- philosophical reflection
- journaling
- therapy/coach behavior
- values/personality engine

Only include context that changes daily planning.

## Migration Strategy

1. Finish HLD/LLD/tickets in this repo.
2. Decide backend stack and schema.
3. Copy only infrastructure and patterns that still fit.
4. Reimplement core domain logic around:
   - domains
   - projects
   - tasks
   - routine templates
   - day plans
   - plan items
   - deferral logs
   - completion events
   - planning context
5. Keep tests strict and fixture-driven from the start.

