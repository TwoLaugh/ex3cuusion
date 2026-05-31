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

The app still defaults to the in-memory repository while the Postgres repository is being wired in, but the V1 schema can already be run locally.

```bash
npm run db:up
npm run db:migrate
```

Default local database:

```text
postgres://ex3cuusion:ex3cuusion@127.0.0.1:54329/ex3cuusion
```

Add that as `DATABASE_URL` in `.env.local` if it is not already present.

To run the current app state through Postgres instead of memory/file storage:

```text
EX3CUUSION_STATE_REPOSITORY=postgres
```

This uses a snapshot bridge while the normalized table mappers are being introduced.

Stop the database with:

```bash
npm run db:down
```

