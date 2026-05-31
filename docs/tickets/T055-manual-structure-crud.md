# T055: Manual Structure CRUD

Status: implemented.

## Goal

Let the user manually maintain tasks, projects/containers, domains, and routines without relying entirely on AI.

## Scope

- Create/edit/archive tasks.
- Create/edit/archive containers/projects.
- Create/edit/archive routines.
- Move tasks between containers/domains.
- Edit core task metadata: status, priority, effort, dates, completion behavior, definition of done, repeat policy, and notes.
- Keep controls minimal and human-friendly.

## Acceptance Criteria

- The user can correct AI-created structure manually.
- Manual changes are reflected in Today, backlog panels, AI activity/audit surfaces, and planner output.
- E2E tests cover realistic manual correction flows.

## Implementation Notes

- Manual controls live in the existing burger panels instead of a separate admin surface.
- Domains support create/edit; tasks support create/edit/archive; projects support create/edit/pause; routines support create/edit/archive via `active=false`.
- The structure API writes through the same `AppStateRepository` boundary as AI actions, so file, in-memory, and Postgres-backed runs use the same behavior.
