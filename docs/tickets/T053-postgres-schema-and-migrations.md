# T053: Postgres Schema And Migrations

Status: implemented in V1 foundation.

## Goal

Create the V1 Postgres foundation without switching the app away from the current repository yet.

## Scope

- Add local Postgres Docker setup.
- Add SQL migration infrastructure.
- Create the V1 execution-engine tables for domains, containers/projects, tasks, routines, plans, plan items, execution events, inbox items, capture sessions, AI actions, and planning context.
- Keep auth/multi-user light: include a single seeded local user, but do not build product auth.
- Add a migration runner and package scripts.

## Acceptance Criteria

- A clean local database can be started and migrated.
- Migrations are tracked in a `schema_migrations` table.
- Schema supports the current rich task model, capture-session memory, date intent, scheduling metadata, and execution events.
- No runtime app behavior changes until the repository switch ticket.
