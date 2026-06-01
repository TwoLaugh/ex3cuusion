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

1. **Nested folders (multi-level)** — a real folder tree: a folder has an optional `parentFolderId`
   and can contain both sub-folders and tasks, to arbitrary depth (with cycle prevention). Replaces
   domains + projects with one recursive `folder` concept. This makes migration clean: each domain
   becomes a top-level folder and each project becomes a child folder under its domain.
2. **Routine = a task flag** — remove the RoutineTemplate entity; recurrence lives on the task's
   `repeatPolicy` (done in T088-part). Migrate existing routines to recurring tasks.
3. **Keep folder blocks** — a folder can render as a grouped block of its tasks on the day (the
   project-block feature is recast onto folders).

Implication: "folder" is a recursive tree merging today's domain + project roles; recurrence lives
on tasks; the Domains/Projects/Routines admin panels collapse into one Folders tree panel + task
flags.

## Acceptance Criteria

- The app has one grouping concept (folders) + tasks + task flags; no separate project/routine
  concepts in the UI; planner/week-plan/AI all work against folders.

---

## Implementation Analysis (full change map)

### Target end-state model

- `Folder { id, name, parentFolderId?: string, weight?, canBlock?: boolean, defaultBlockMinutes?, contextNote? }`
  — a recursive tree replacing both `Domain` and `Project`. `parentFolderId` null = top level;
  arbitrary depth with cycle prevention (reuse the `isDescendantOf` pattern from T076). Block-
  relevant Project attributes (defaultBlockMinutes, `canBlock`) move onto Folder; `kind`/
  `planningMode`/`priorityWeight` dropped; `status` kept as active/archived only.
- `Task.folderId` (replaces `domainId`); **remove `projectId`**. A task lives in exactly one folder
  at any level. `parentTaskId` stays (task subtasks — orthogonal to the folder tree).
- `FolderBlockSelection { date, folderId, selectedTaskIds, updatedAt }` — renamed
  ProjectBlockSelection (keep folder blocks).
- **Remove `RoutineTemplate`**; recurrence already lives on tasks (`repeatPolicy`, done in T088-part).
  Migrate any seed routines to recurring tasks.
- `AppState`: `folders` (replaces `domains` + `projects`), `folderBlockSelections` (replaces
  `projectBlockSelections`); drop `routines`.

### Decisions to confirm before coding

1. **Internal rename vs UI-relabel.** Cleanest is to rename `domain`→`folder` everywhere (kills
   confusing tech debt) — but it's the bulk of the mechanical churn (~150 `domain*` refs). Lower
   effort: keep internal `domainId` naming, only remove `project` and relabel in the UI. RECOMMEND
   the full internal rename for a genuinely simple model.
2. **Folder block scope (NEW with nesting).** When a folder renders as a day block, does it include
   only its DIRECT-child tasks, or all tasks in its subtree (descendant folders too)? RECOMMEND
   direct-child tasks (predictable, avoids a giant block); the tree view shows the full hierarchy
   separately. Pairs with an explicit `canBlock` flag on the folder.
3. **Folder rollups recursive.** Folder task counts / effort in the tree aggregate the whole subtree
   (like `childStats` for tasks). Scheduling stays task-level (folders only group, they aren't
   scheduled), so no double-counting.
4. **AI action shape.** Drop `create_project`/`create_routine`. Grouping (T062) becomes
   `create_folder` (with optional `parentFolderName` so the model can nest) + create_task with
   `folderName`; recurring capture sets `repeatPolicy` on a create_task. Confirm the enum change.
5. **Postgres now or later.** The normalized Postgres projection (pg-state-repository.mjs ~83 refs +
   migrations 001/002/004/008) maps projects/routines/domains to tables. Default dev is in-memory,
   so RECOMMEND: do the in-memory/file path now; stage the Postgres schema migration (self-
   referencing folders table) as a follow-up unless the durable path is in active use.

### File-by-file change map

- **src/lib/types.ts** — add `Folder` (with `parentFolderId?`); remove `Project`,
  `RoutineTemplate`, `ContainerKind`, `PlanningMode` (if unused); rename
  `ProjectBlockSelection`→`FolderBlockSelection`; Task `domainId`→`folderId`, drop `projectId`;
  AppState `domains`+`projects`→`folders`, `projectBlockSelections`→`folderBlockSelections`, drop
  `routines`; AiAction enum drop create_project/create_routine, add create_folder; action schema
  `projectName`→`folderName` + add `parentFolderName` (so the AI can nest).
- **src/lib/seed.ts** (~25 refs) — seed `folders` + tasks with `folderId`; convert seed routines to
  recurring tasks; drop project seeds.
- **src/lib/scenarios.ts** (~61 refs) — realistic-character state rebuilt on folders + recurring
  tasks (no projects/routines).
- **src/lib/repository.ts** — `normalizeState` migration: each domain → a top-level folder; each
  project → a child folder with `parentFolderId` = its domain's folder; task.projectId → that
  project's folder, else task.domainId → that domain's folder; routines → recurring tasks under
  their domain's folder; seed a default folder if empty. (Clean, lossless thanks to nesting.)
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
  `folder` entity (create/update/archive) with `parentFolderId` + a `resolveFolderParent` cycle
  guard (mirror `resolveParentForChild` from T076); `applyStructureMutation` folder ops; task
  create/update sets `folderId` (drop projectId inheritance); project-block-selection→folder-block;
  remove routine CRUD; `validProjectId`/`findProject`→folder; grouping helpers (`linkPendingProject`
  → folder, by name/path). Add a recursive `folderRollup`/`tasksInSubtree` helper.
- **src/app/page.tsx** — `secondaryViews`: drop Domains/Projects/Routines, add **Folders** (a
  collapsible TREE, not a flat list); folder create/edit with a parent-folder selector (+ cycle
  guard) and canBlock/block-minutes; task create/edit: a **path-style folder selector** ("Work /
  Client X") replacing the domain+project selectors; remove the Routines panel (recurrence is the
  per-task Repeats control, already added); project drawer → folder-block drawer;
  `projectKinds`/`planningModes` removed; `buildProjectSummaries`/`projectName` → folder + a tree
  builder + recursive rollup display. (Nesting adds the most NEW UI here: tree render, path picker,
  breadcrumbs.)
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
