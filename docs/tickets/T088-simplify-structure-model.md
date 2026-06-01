# T088: Simplify the Structure Model (Folders + Tasks; Routine as a Flag)

Status: in progress. (Large — data model + planner + AI + UI.)

## Progress

- **Routine-as-a-flag: DONE.** A task can be set to repeat (none / daily / weekly + days) directly
  in the editor; the planner already schedules recurring tasks via `isRepeatPolicyDue`, so a
  flagged task plans on its due days. A `↻ daily/weekly` badge shows on task cards. Unit-tested.
  (The separate RoutineTemplate entity still exists for now and is removed in the structure
  collapse below.)
- **Remaining (the structure collapse): NOT STARTED.** Removing `projects`, merging domains+
  projects into one flat `folder`, recasting project-blocks as folder-blocks, folding the
  Domains/Projects/Routines admin panels into one Folders panel, and migrating data. This is ~400
  `project` references across 10 files — a real migration best done as a focused, staged effort
  WITH in-browser verification (it reshapes the core UX). Deliberately not crammed blind.

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

## Decisions (confirmed)

1. **Single-level folders** — flat categories (folders hold tasks, no sub-folders). Replaces
   domains + projects with one `folder` concept.
2. **Routine = a task flag** — remove the RoutineTemplate entity; a task carries a `recurring`
   flag + recurrence. Migrate existing routines to flagged tasks.
3. **Keep folder blocks** — a folder can still render as a grouped block of its tasks on the day
   (the project-block feature is recast onto folders).

Implication: a "folder" merges today's domain + project roles into one flat level that can
optionally behave as a day block; recurrence lives on tasks; the Domains/Projects/Routines admin
panels collapse into one Folders panel + task flags.

## Acceptance Criteria

- The app has one grouping concept (folders) + tasks + task flags; no separate project/routine
  concepts in the UI; planner/week-plan/AI all work against folders.
