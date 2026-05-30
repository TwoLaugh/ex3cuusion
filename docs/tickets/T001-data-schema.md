# T001: Create Core Data Schema

## Goal

Add migrations for the V1 execution-engine data model.

## Scope

Create tables: users, domains, projects, tasks, routine_templates, day_plans, plan_items, completion_events, deferral_logs, inbox_items, ai_action_logs, and planning_context.

## Requirements

- Use UUID primary keys.
- Add ownership via `user_id` on user-owned rows.
- Add status/type check constraints from `docs/lld/01-data-model.md`.
- Add unique `day_plans(user_id, plan_date)`.
- Add indexes for Today, project backlog, domain active lists, and AI audit queries.
- Seed or fixture at least one domain, project, routine, task, and empty Today plan for local development.

## Acceptance

- Migrations run from empty database.
- Migrations can be rolled back or recreated in local dev.
- Basic fixture query can load all inputs required by Today.
- No Android V2 app-launcher tables are introduced.

