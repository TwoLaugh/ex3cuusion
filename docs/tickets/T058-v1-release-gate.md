# T058: V1 Release Gate

Status: implemented.

## Goal

Make the web-first V1 coherent enough to run daily and decide whether Android V1 should wrap/reuse it.

## Scope

- Ticket/status audit for `T001-T037`.
- README and local runbook updates.
- Env validation and secret hygiene.
- CI-style command list for typecheck, unit tests, E2E, AI evals, and build.
- Mobile usability pass.
- V1 acceptance checklist against HLDs.

## Acceptance Criteria

- A new developer can run the app, database, tests, and evals from docs.
- V1 scope is explicitly marked complete/incomplete.
- Android V1 decision can be made from a stable web baseline.

## Implementation Notes

- Added `docs/release/v1-release-gate.md` with ticket audit, HLD checklist, known limits, Android V1 decision, and verification commands.
- Added `docs/runbook/local-development.md` with setup, env, Postgres, test, eval, and reset guidance.
- Updated README with durable Postgres path and release-gate commands.
- Added `npm run check:env` and `npm run release:check`.
- Added a release env/secret hygiene script that validates ignored env files and scans tracked files for OpenAI key-shaped secrets.
