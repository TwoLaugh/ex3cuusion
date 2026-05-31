# V1 Release Gate

Date: 2026-05-31

## Decision

The web-first plumbing baseline (state model, planner, Postgres durability, inbox apply/audit
pipeline) is covered by automated tests. **AI capture quality is NOT release-gated by the
automated suite** — `npm run eval:ai` runs the deterministic fixture, which is a smoke test
only. Real AI quality must be validated with `npm run eval:ai:live` against the model on
held-out inputs before V1 can claim a daily-use baseline. Treat AI quality as open until that
live evidence exists.

Android V1 should wrap or reuse the web app/backend concepts rather than start a separate native planner now. Native launcher/app-control work remains V2.

## Release Commands

```bash
npm run check:env
npx tsc --noEmit
npm run test
npm run eval:ai   # fixture SMOKE only — not a model-quality signal
npm run test:e2e
npm run build
```

Required before shipping any AI behavior change (uses API credit, not in `release:check`):

```bash
npm run eval:ai:live
```

Postgres-backed smoke:

```bash
npm run db:up
npm run db:migrate
$env:DATABASE_URL='postgres://ex3cuusion:ex3cuusion@127.0.0.1:54329/ex3cuusion'
$env:EX3CUUSION_STATE_REPOSITORY='postgres'
$env:EX3CUUSION_LOCAL_USER_ID='00000000-0000-0000-0000-000000000058'
npm run test:e2e
```


## Scope Audit

| Area | Tickets | Status | Evidence |
| --- | --- | --- | --- |
| Core data model | T001, T016, T017, T038, T041 | Implemented | Rich `AppState`, date intent, task scheduling, completion modes, project/category structure. |
| Admin/manual correction | T002, T019, T045, T046, T055 | Implemented | Burger menu panels edit domains, projects, tasks, routines, planning prefs, and expose backlog rollups. |
| Today planner | T003, T008, T009, T010, T039, T040, T042, T044, T047 | Implemented | Day timeline, week-aware backlog, project blocks, overlap/phased scheduling, previous/next day navigation. |
| Execution loop | T004, T021, T022, T023, T024, T025, T056, T057 | Implemented with one caveat | Complete/undo, not-done reasons, partial progress, blocked/waiting, project drawer subtasks, daily review calibration. Delegation metadata exists, but delegation-specific UI is not a first-class V1 surface. |
| AI capture | T005, T006, T007, T018, T026, T027, T028, T029, T030, T048, T049, T050, T052 | Implemented | AI inbox, structured actions, validation/apply path, clarification sessions, chat follow-ups, revision flow. |
| AI evals | T031, T032, T033, T034, T035, T036, T051 | Harness only — quality unproven | Fixture eval is a SMOKE test (pipeline runs, no failed actions). Semantic scenarios run only under `eval:ai:live`, which has not been run as a gate. AI quality is currently unverified by CI. |
| Background/concurrent work | T037, T043 | Removed pending model-owned redesign | Phased/concurrent/background scheduling was inferred from hard-coded keyword matching (laundry/cook/AI) — overfit to demo phrases — and has been removed. The model now defaults tasks to exclusive. Reintroduce overlap semantics as explicit model-owned schema fields, not keyword guesses. |
| Mobile web | T013 | Usable baseline | Main Today, AI inbox, project drawer, not-done modal, and daily review are responsive. This is not final visual polish for a consumer launch. |
| Audit/debug | T014 | Implemented | `/api/debug`, AI activity panel, planner/test assertions. |
| Android V1 decision | T015 | Decided | Wrap/reuse web for V1 if needed; native launcher belongs to V2. |
| V2 proactive hygiene | T020 | Deferred | Explicitly V2. Not required for V1 completion. |
| Postgres durability | T053, T054 | Implemented | Migrations, normalized projection/readback, Postgres-backed tests. |

## HLD Acceptance

- Today is the primary screen: pass.
- Other areas are secondary behind burger menu: pass.
- AI inbox is always one action away: pass.
- Completion/defer controls keep items visible for misclick recovery: pass.
- Project blocks expose selected child tasks: pass.
- Deferrals and daily review feed planner calibration: pass.
- Week handling exists without a full calendar surface: pass.
- Web is usable on mobile: pass as baseline.
- Android launcher/app blocking: deferred to V2.
- Auth/multiple users: deferred to V3.

## Known V1 Limits

- No auth or multi-user account model in the product surface.
- AI review/proactive structure hygiene is deferred to V2.
- Delegation exists as structured metadata, but V1 does not optimize around delegated work yet.
- Mobile web is usable, not a final Android-native interaction design.
- Postgres repository is single-user/local and keyed by `EX3CUUSION_LOCAL_USER_ID`; auth/multiple users remain V3.

## Secret Hygiene

- `.env`, `.env.local`, logs, Playwright output, and build artifacts are ignored.
- `npm run check:env` scans tracked files for OpenAI key-shaped secrets.
- Live evals require an explicit `OPENAI_API_KEY` and are not part of fixture release checks.
