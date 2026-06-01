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

---

## Implementation Analysis (full change map)

### Target end-state model

- `Folder { id, name, weight, canBlock?: boolean, defaultBlockMinutes?, contextNote? }` — replaces
  both `Domain` and `Project` (single flat level). The block-relevant Project attributes
  (defaultBlockMinutes, the "appears as a block" idea) move onto Folder; `kind`/`planningMode`/
  `priorityWeight`/`status` are dropped (or `status` kept as active/archived only).
- `Task.folderId` (replaces `domainId`); **remove `projectId`**. `parentTaskId` stays (subtasks).
- `FolderBlockSelection { date, folderId, selectedTaskIds, updatedAt }` — renamed
  ProjectBlockSelection (keep folder blocks).
- **Remove `RoutineTemplate`**; recurrence already lives on tasks (`repeatPolicy`, done in T088-part).
  Migrate any seed routines to recurring tasks.
- `AppState`: `folders` (replaces `domains` + `projects`), `folderBlockSelections` (replaces
  `projectBlockSelections`); drop `routines`.

### Decisions to confirm before coding

1. **Internal rename vs UI-relabel.** Cleanest is to rename `domain`→`folder` everywhere (kills
   confusing tech debt) — but that's the bulk of the mechanical churn (~150 `domain*` refs). Lower
   effort: keep internal `domainId` naming, only remove `project` and relabel "Domain"→"Folder" in
   the UI. RECOMMEND the full internal rename for a genuinely simple model.
2. **Folder-as-block trigger.** How does a folder become a day block? Options: a `canBlock` flag on
   the folder, or "any folder with N+ scheduled tasks renders as a block". RECOMMEND a `canBlock`
   flag (explicit, predictable).
3. **AI action shape.** Drop `create_project`/`create_routine`. Grouping (T062) becomes
   `create_folder` + create_task with `folderName`; recurring capture sets `repeatPolicy` on a
   create_task instead of `create_routine`. Confirm the action enum change.
4. **Postgres now or later.** The normalized Postgres projection (pg-state-repository.mjs ~83 refs +
   migrations 001/002/004/008) maps projects/routines/domains to tables. Default dev is in-memory,
   so RECOMMEND: do the in-memory/file path now; stage the Postgres schema migration as a
   follow-up (T077-adjacent) unless the durable path is in active use.

### File-by-file change map

- **src/lib/types.ts** — add `Folder`; remove `Project`, `RoutineTemplate`, `ContainerKind`,
  `PlanningMode` (if unused elsewhere); rename `ProjectBlockSelection`→`FolderBlockSelection`;
  Task `domainId`→`folderId`, drop `projectId`; AppState `domains`+`projects`→`folders`,
  `projectBlockSelections`→`folderBlockSelections`, drop `routines`; AiAction enum drop
  create_project/create_routine (+ add create_folder); drop `RepeatPolicy`? (no, keep).
- **src/lib/seed.ts** (~25 refs) — seed `folders` + tasks with `folderId`; convert seed routines to
  recurring tasks; drop project seeds.
- **src/lib/scenarios.ts** (~61 refs) — realistic-character state rebuilt on folders + recurring
  tasks (no projects/routines).
- **src/lib/repository.ts** — `normalizeState`: migrate any old-shape state (domains+projects→
  folders; routines→tasks; task.domainId/projectId→folderId); seed a default folder if empty.
- **src/lib/planner.ts** — `isRoutineDue`/routine-instance loop (line 126) removed (recurring tasks
  already handled by `isRepeatPolicyDue`); project blocks (148-207) rekeyed to folders
  (`tasksByFolder`, `shouldAppearInFolderBlock` via folder.canBlock); `projectBlockSelectionOverride`/
  `isValidProjectBlockTask` → folder; `item.projectId`→`item.folderId`.
- **src/lib/week-plan.ts** — `projectId` refs → `folderId` (backlog item mapping).
- **src/lib/ai-actions.ts** — action enum; `projectName`→`folderName`; `buildInboxModelContext`
  (domains/projects/routines → folders); fixture interpreter (drop create_project/create_routine
  branches, use create_folder + repeatPolicy); prompt (grouping under folder; recurrence as a task
  flag); `findProjectId`/`findProjectName`/`findDomainId`→folder equivalents; `linkPendingProject`→
  `linkPendingFolder`; capture-revision `projectName`/`domainName`→`folderName`.
- **src/lib/state.ts** — `StructureMutation`: collapse domain/project/routine entities to one
  `folder` entity (+ keep task); `applyStructureMutation` folder create/update/archive; task
  create/update folderId (drop projectId inheritance); project-block-selection→folder-block;
  remove routine CRUD; `validProjectId`/`findProject`→folder; `schedulingForMode`/grouping helpers
  unaffected.
- **src/app/page.tsx** — `secondaryViews`: `["Folders","Tasks","Planning preferences","AI activity"]`
  (drop Domains/Projects/Routines, add Folders); one Folders admin panel (name/weight/canBlock/
  block-minutes); task create/edit: single `folderId` selector (drop project selector); remove the
  Routines panel (recurrence is the per-task Repeats control, already added); project drawer →
  folder-block drawer; `projectKinds`/`planningModes` consts removed; `buildProjectSummaries`/
  `projectName` helpers → folder.
- **db/migrations + scripts/pg-state-repository.mjs** — (if doing Postgres now) new migration:
  folders table, task.folder_id, drop/retire projects/routines/project_block_selections tables;
  update the projection read/write (~83 refs).
- **Tests** — state.test.ts (~72 refs), planner.test.ts (~9), ai-actions.test.ts: update all
  domain/project/routine fixtures to folders + recurring tasks. Quality scenarios
  (scripts/quality/*) reference projects/domains in rubrics — update wording.

### Execution sequence (green tsc+tests at each step)

1. Types: add Folder + new AppState/Task shape (keep a temporary compat so it compiles).
2. seed + scenarios + repository.normalizeState (incl. old-state migration).
3. planner + week-plan (folder blocks; drop routine-instance loop).
4. state.ts (folder mutation; block selection; remove routine CRUD).
5. ai-actions (actions, context, prompt, fixture, helpers).
6. page.tsx (Folders panel, task editor, drawers, nav).
7. Tests + quality scenarios.
8. (Optional) Postgres migration + projection.

### Risk / verification

- Largest single change of the project (~400 project + ~140 routine refs). Do it on its own branch,
  tsc+unit-tests green after each numbered step, and BROWSER-VERIFY the new Folders UX (nav, task
  editor, folder block on the day) before merge — the unit tests can't see the visual reshape.
- Keep `normalizeState` migrating old in-memory/file state so existing data isn't lost.
