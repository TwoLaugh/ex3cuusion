# ex3cuusion

AI-assisted execution engine.

This is not a general todo app, journal, life coach, second brain, or personal biography system.

The product exists to answer one question:

> Given my routines, deadlines, projects, neglected areas, and current capacity, what should I actually do today?

Core loop:

```text
capture -> organize -> plan -> execute -> defer/review -> adapt
```

## Current Scope

V1 focuses on:

- AI inbox / command chat
- task, routine, domain, and project database
- daily planner
- project blocks with selected subtasks
- completion and deferral loop
- daily review for planner calibration
- web app

V1 is web-first. The web app is where the core product, interaction model, and visual design should be worked out before building a native or wrapped Android app.

AI is central to the product. The system should be designed around AI-assisted capture, organization, planning, clarification, and review, with structured validation around anything that changes user data.

V2 adds:

- minimalist Android launcher
- app request and justification flow
- task-linked app launching
- timers
- reminders
- app-use logging

Out of scope for V1:

- personal biography
- journaling
- self-understanding system
- values/personality engine
- therapy or coaching layer
- philosophical reflection
- full Android launcher
- hard app blocking

## Local Postgres

The app defaults to the in-memory repository for fast local development. The durable V1 path is Postgres.

```bash
npm run db:up
npm run db:migrate
```

Default local database:

```text
postgres://ex3cuusion:ex3cuusion@127.0.0.1:54329/ex3cuusion
```

Add that as `DATABASE_URL` in `.env.local` if it is not already present.

To run app state through Postgres instead of memory/file storage:

```text
EX3CUUSION_STATE_REPOSITORY=postgres
EX3CUUSION_LOCAL_USER_ID=00000000-0000-0000-0000-000000000001
```

This uses the normalized Postgres projection/readback. For isolated local state, set `EX3CUUSION_LOCAL_USER_ID` to a different UUID.

Stop the database with:

```bash
npm run db:down
```

## Local Development

See `docs/runbook/local-development.md` for the full runbook.

Common loop:

```bash
npm install
copy .env.example .env.local
npm run db:up
npm run db:migrate
npm run dev
```

## Release Gate

The V1 release gate is documented in `docs/release/v1-release-gate.md`.

Structural / plumbing checks (no model — safe and free):

```bash
npm run check:env
npx tsc --noEmit
npm run test
npm run eval:ai      # FIXTURE SMOKE ONLY — proves the pipeline runs; not a quality signal
npm run test:e2e
npm run build
```

Or run the combined command:

```bash
npm run release:check
```

**AI quality is gated separately and is not covered by `release:check`.** `eval:ai` runs the
deterministic fixture, so it can never tell you whether the *model* behaves well — it only
proves the pipeline applies actions without error. Before shipping any change to AI behavior,
run the live quality evals against the real model (these use API credit):

```bash
npm run eval:ai:live
```

