# Local Development Runbook

## Prerequisites

- Node.js 22 or compatible current LTS.
- npm.
- Docker, for the Postgres-backed V1 path.

## First Run

```bash
npm install
copy .env.example .env.local
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000` unless Next chooses another port.

## Environment

`OPENAI_API_KEY` is optional for fixture development and required for live AI evals.

For durable local state, set:

```text
DATABASE_URL=postgres://ex3cuusion:ex3cuusion@127.0.0.1:54329/ex3cuusion
EX3CUUSION_STATE_REPOSITORY=postgres
EX3CUUSION_LOCAL_USER_ID=00000000-0000-0000-0000-000000000001
```

For deterministic tests and fixture AI behavior:

```text
EX3CUUSION_AI_MODE=fixture
```

Never commit `.env`, `.env.local`, real OpenAI keys, database dumps, or test artifacts. `npm run check:env` checks the common failure modes.

## Daily Commands

```bash
npm run db:up
npm run db:migrate
npm run dev
```

## Verification Commands

```bash
npm run check:env
npx tsc --noEmit
npm run test
npm run eval:ai
npm run test:e2e
npm run build
```

`npm run release:check` runs the same release-gate command chain with fixture AI.

Live model smoke checks are explicit and spend API credits:

```bash
npm run eval:ai:live
```

## Postgres-Backed Test Runs

```bash
$env:DATABASE_URL='postgres://ex3cuusion:ex3cuusion@127.0.0.1:54329/ex3cuusion'
$env:EX3CUUSION_STATE_REPOSITORY='postgres'
$env:EX3CUUSION_LOCAL_USER_ID='00000000-0000-0000-0000-000000000099'
npm run test:e2e
```

## Reset Local State

- In-memory state resets with `POST /api/state`, which the test harness uses.
- Postgres state can use a new `EX3CUUSION_LOCAL_USER_ID` UUID for an isolated local state bucket.
- Stop Postgres with `npm run db:down`.

## Current V1 Surfaces

- Today timeline.
- AI inbox and clarifying chat.
- Burger menu admin panels for domains, projects, tasks, routines, planning preferences, and AI activity.
- Project block drawer with selected subtasks and backlog.
- Not-done outcome modal.
- Daily review calibration dialog.
