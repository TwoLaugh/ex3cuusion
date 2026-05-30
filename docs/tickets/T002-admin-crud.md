# T002: Build Secondary Admin CRUD

## Goal

Create basic server actions/endpoints and burger-menu screens for maintaining domains, projects, tasks, routines, and planning preferences.

## Scope

- Domains list/create/edit/archive
- Projects list/create/edit/archive
- Tasks list/create/edit/complete/defer/archive
- Routines list/create/edit/pause
- Planning preferences edit

## Requirements

- These screens are reachable only from the burger menu.
- They are utilitarian admin surfaces, not the primary product home.
- Task forms include domain, project, due date, schedule date, effort, energy, priority, importance, urgency, and strictness.
- Project forms include domain, priority weight, default block minutes, due date, and AI context note.

## Acceptance

- User can create the records needed for a manual Today plan.
- Archive/pause actions do not delete data.
- All mutations validate user ownership.

