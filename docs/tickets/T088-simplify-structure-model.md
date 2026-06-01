# T088: Simplify the Structure Model (Folders + Tasks; Routine as a Flag)

Status: planned. (Large — data model + planner + AI + UI.)

## Goal

Replace the domain/project/routine split with a single "folder" grouping concept: categories
(folders) that contain tasks. Drop "projects" as a separate concept. Routine becomes a flag on a
task, not a separate entity. The mental model is a folder system: folders hold tasks; tasks carry
flags (recurring, etc.).

## Current model

`domains` (top-level areas) + `projects` (under domains, with project blocks/planning modes) +
`tasks` + `routines` (separate RoutineTemplate entity). Projects are wired into the planner
(project blocks with selected subtasks), week-plan, AI grouping (T062 creates projects), and the
Domains/Projects admin panels.

## Scope (pending decisions below)

- Introduce a single `category`/folder entity; map existing domains and projects onto it; remove
  the project concept (and project-block UI) or recast it as a folder.
- Make recurrence a task flag (e.g. `recurring` + recurrence) instead of a separate routine
  entity; migrate existing routines to flagged tasks.
- Update: types, seed, planner (folder grouping in place of project blocks), week-plan, AI
  grouping/prompt (group under a folder, not a project), structure CRUD UI (one "Folders" panel),
  task editor (folder selector + flags).
- Keep AI + manual paths sharing the same mutations and undo.

## Open decisions (to confirm before building)

1. Folder nesting: nested folders (folders within folders) or a single level of categories?
2. Routines: convert to a per-task recurring flag and remove the RoutineTemplate entity, or keep
   routines but present them as flagged tasks?
3. Project blocks (Today currently shows a project's selected subtasks as a grouped block): drop
   the block concept (just tasks), or keep it as a "folder block"?

## Acceptance Criteria

- The app has one grouping concept (folders) + tasks + task flags; no separate project/routine
  concepts in the UI; planner/week-plan/AI all work against folders.
