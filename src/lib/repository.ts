import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createSeedState } from "./seed";
import type { AppState, Domain, Folder, Project } from "./types";

export interface AppStateRepository {
  read(): AppState;
  write(nextState: AppState): AppState;
  reset(): AppState;
}

class InMemoryAppStateRepository implements AppStateRepository {
  private state?: AppState;

  read(): AppState {
    this.state ??= createSeedState();
    this.state = normalizeState(this.state);
    return this.state;
  }

  write(nextState: AppState): AppState {
    this.state = nextState;
    return this.read();
  }

  reset(): AppState {
    this.state = createSeedState();
    return this.read();
  }
}

class FileAppStateRepository implements AppStateRepository {
  constructor(private readonly filePath: string) {}

  read(): AppState {
    if (!fs.existsSync(this.filePath)) {
      return this.reset();
    }
    return normalizeState(JSON.parse(fs.readFileSync(this.filePath, "utf8")) as AppState);
  }

  write(nextState: AppState): AppState {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(nextState, null, 2));
    return this.read();
  }

  reset(): AppState {
    return this.write(createSeedState());
  }
}

class PostgresAppStateRepository implements AppStateRepository {
  private readonly scriptPath = path.join(process.cwd(), "scripts", "pg-state-repository.mjs");
  private state?: AppState;

  read(): AppState {
    if (this.state) {
      this.persist(this.state);
      return normalizeState(this.state);
    }
    const output = this.run("read");
    if (!output.trim()) {
      return this.reset();
    }
    this.state = normalizeState(JSON.parse(output) as AppState);
    return this.state;
  }

  write(nextState: AppState): AppState {
    this.state = normalizeState(nextState);
    this.persist(this.state);
    return this.state;
  }

  reset(): AppState {
    return this.write(createSeedState());
  }

  private persist(state: AppState) {
    this.run("write", JSON.stringify(state));
  }

  private run(command: "read" | "write" | "delete", input?: string): string {
    const result = spawnSync(process.execPath, [this.scriptPath, command], {
      cwd: process.cwd(),
      env: process.env,
      input,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    if (result.status !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `Postgres state repository command failed: ${command}`;
      throw new Error(message);
    }
    return result.stdout;
  }
}

const globalStore = globalThis as typeof globalThis & { __ex3cuusionRepository?: AppStateRepository };

export function getRepository(): AppStateRepository {
  globalStore.__ex3cuusionRepository ??= buildDefaultRepository();
  return globalStore.__ex3cuusionRepository;
}

export function setRepositoryForTests(repository: AppStateRepository) {
  globalStore.__ex3cuusionRepository = repository;
}

export function createPostgresRepositoryForTests(): AppStateRepository {
  return new PostgresAppStateRepository();
}

function buildDefaultRepository(): AppStateRepository {
  if (process.env.EX3CUUSION_STATE_REPOSITORY === "postgres") {
    return new PostgresAppStateRepository();
  }
  if (process.env.EX3CUUSION_STATE_FILE) {
    return new FileAppStateRepository(process.env.EX3CUUSION_STATE_FILE);
  }
  return new InMemoryAppStateRepository();
}

function normalizeState(state: AppState): AppState {
  // T088 Stage 2b: folders are now the canonical store. Build/repair the folder tree first, then
  // (re)derive domains/projects/task.domainId/task.projectId FROM folders for back-compat below.
  deriveStructureFromFolders(state);
  state.domains ??= [];
  if (state.domains.length === 0) {
    state.domains.push({ id: "domain_personal", name: "Personal", weight: 5 });
  }
  const fallbackDomainId = state.domains[0].id;
  const domainIds = new Set(state.domains.map((domain) => domain.id));
  for (const project of state.projects ?? []) {
    if (!domainIds.has(project.domainId)) project.domainId = fallbackDomainId;
  }
  const projectsById = new Map((state.projects ?? []).map((project) => [project.id, project]));
  for (const task of state.tasks ?? []) {
    const project = task.projectId ? projectsById.get(task.projectId) : undefined;
    if (project) {
      task.domainId = project.domainId;
      if (task.type === "atomic") task.type = task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "project_task";
    } else if (!domainIds.has(task.domainId)) {
      task.projectId = undefined;
      task.domainId = fallbackDomainId;
    }
  }
  // Migrate any legacy routine templates (T088) into recurring tasks, then drop the field.
  const legacyRoutines = (state as AppState & { routines?: Array<Record<string, unknown>> }).routines;
  if (Array.isArray(legacyRoutines) && legacyRoutines.length) {
    for (const routine of legacyRoutines) {
      const recurrence = (routine.recurrence as { type?: string; days?: number[] }) ?? { type: "daily" };
      const domainId = domainIds.has(routine.domainId as string) ? (routine.domainId as string) : fallbackDomainId;
      state.tasks.push({
        id: `task_${String(routine.id ?? "routine")}`,
        title: String(routine.title ?? "Routine"),
        type: "atomic",
        domainId,
        status: "active",
        repeatPolicy:
          recurrence.type === "weekly"
            ? { type: "weekly", days: recurrence.days ?? [1], carryover: "skip" }
            : { type: "daily", carryover: "skip" },
        completionBehavior: "repeatable",
        completionMode: "repeatable_checkoff",
        plannerFields: { intentType: "obligation", pressureLevel: "soft" },
        priority: 4,
        importance: 4,
        urgency: 3,
        effortMinutes: Number(routine.defaultEffortMinutes ?? 20),
        energy: (routine.energy as "low" | "medium" | "high") ?? "low",
        strictness: (routine.strictness as "flexible" | "normal" | "strict") ?? "normal",
        dateIntent: { kind: "recurring", confidence: 0.8 }
      });
    }
  }
  delete (state as AppState & { routines?: unknown }).routines;
  state.executionEvents ??= [];
  state.projectBlockSelections ??= [];
  state.dailyReviews ??= [];
  state.captureSessions ??= [];
  for (const session of state.captureSessions) {
    session.messages ??= [];
    session.questions ??= [];
    session.actionIds ??= [];
    session.draftActionIds ??= [];
    session.appliedEntityIds ??= [];
    session.answeredFields ??= [];
    session.revisionEvents ??= [];
    session.unresolvedFields ??= [];
  }
  return state;
}

// T088 Stage 2b: `folders` is the canonical recursive structure store. This walks the folder tree
// up to its root, guarding against cycles with a seen-set; used to map any folder to the top-level
// folder that plays the role of its legacy "domain".
export function topAncestorFolderId(folders: Folder[], folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  let current = byId.get(folderId);
  if (!current) return folderId;
  while (current.parentFolderId && byId.has(current.parentFolderId) && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentFolderId)!;
  }
  return current.id;
}

// T088 Stage 2b: make `folders` canonical. If folders are missing/empty but legacy domains exist,
// first build folders from domains+projects (the old Stage 2a derivation; ids preserved). Then
// always (re)derive domains, projects, each task's domainId/projectId, and projectBlockSelections
// FROM folders + task.folderId so every existing consumer keeps working unchanged.
function deriveStructureFromFolders(state: AppState): void {
  state.folders ??= [];

  // Legacy migration: no folders yet but we have domains -> seed folders from domains+projects.
  if (state.folders.length === 0 && (state.domains?.length ?? 0) > 0) {
    state.folders = [
      ...state.domains.map((domain) => ({ id: domain.id, name: domain.name, weight: domain.weight })),
      ...(state.projects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        parentFolderId: project.domainId,
        canBlock: true,
        defaultBlockMinutes: project.defaultBlockMinutes,
        contextNote: project.contextNote,
        status: project.status === "completed" ? ("archived" as const) : ("active" as const)
      }))
    ];
    for (const task of state.tasks ?? []) {
      task.folderId = task.projectId ?? task.domainId;
    }
    state.folderBlockSelections = (state.projectBlockSelections ?? []).map((selection) => ({
      date: selection.date,
      folderId: selection.projectId,
      selectedTaskIds: selection.selectedTaskIds,
      updatedAt: selection.updatedAt
    }));
  }

  // Reconcile folders FROM any legacy edits before deriving back out. Existing consumers (and AI
  // actions) still create domains/projects and set task.projectId/domainId directly; fold those into
  // the canonical folder tree so the edits survive. A task's projectId ?? domainId is the placement
  // signal: when it points at an existing folder and differs from the current folderId, the task
  // moved via the legacy fields, so retarget folderId. The folder-mutation/folderId-write paths keep
  // projectId/domainId in sync with folderId, so there is no conflict there.
  reconcileFoldersFromLegacy(state);

  const folders = state.folders;
  if (folders.length === 0) return; // nothing canonical to derive from; let domain defaults apply.

  const folderIds = new Set(folders.map((folder) => folder.id));
  const topLevel = folders.filter((folder) => !folder.parentFolderId || !folderIds.has(folder.parentFolderId));
  const fallbackTopId = topLevel[0]?.id ?? folders[0].id;

  // The folder status enum (active/archived) can't distinguish a legacy project's paused vs
  // completed; preserve the prior legacy status for an archived folder so existing edits survive.
  const priorProjectStatus = new Map((state.projects ?? []).map((project) => [project.id, project.status]));

  // domains <- top-level folders
  state.domains = topLevel.map<Domain>((folder) => ({ id: folder.id, name: folder.name, weight: folder.weight ?? 5 }));

  // projects <- non-top folders, with domainId = their top-level ancestor folder id
  state.projects = folders
    .filter((folder) => folder.parentFolderId && folderIds.has(folder.parentFolderId))
    .map<Project>((folder) => {
      const prior = priorProjectStatus.get(folder.id);
      const status: Project["status"] =
        folder.status === "archived" ? (prior === "paused" || prior === "completed" ? prior : "completed") : "active";
      return {
        id: folder.id,
        name: folder.name,
        domainId: topAncestorFolderId(folders, folder.id),
        kind: "project",
        planningMode: "open_backlog",
        status,
        priorityWeight: 0,
        defaultBlockMinutes: folder.defaultBlockMinutes ?? 30,
        contextNote: folder.contextNote ?? ""
      };
    });

  // Each task's derived domainId/projectId follow from its folderId (canonical placement).
  for (const task of state.tasks ?? []) {
    const folder = (task.folderId && folders.find((entry) => entry.id === task.folderId)) || topLevel[0] || folders[0];
    const isTop = !folder.parentFolderId || !folderIds.has(folder.parentFolderId);
    task.folderId = folder.id;
    task.domainId = topAncestorFolderId(folders, folder.id) || fallbackTopId;
    task.projectId = isTop ? undefined : folder.id;
  }

  // projectBlockSelections <- folderBlockSelections (folderId -> projectId) for the planner.
  state.folderBlockSelections ??= [];
  state.projectBlockSelections = state.folderBlockSelections.map((selection) => ({
    date: selection.date,
    projectId: selection.folderId,
    selectedTaskIds: selection.selectedTaskIds,
    updatedAt: selection.updatedAt
  }));
}

// Fold legacy domain/project/task edits back into the canonical folder tree (T088 Stage 2b). Lets
// the still-present domain/project structure mutations and AI actions keep working: a newly created
// domain becomes a top-level folder, a new project becomes a child folder under its domain, and a
// task whose projectId/domainId was set by legacy code is retargeted to the matching folder.
function reconcileFoldersFromLegacy(state: AppState): void {
  const folders = state.folders!;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  // Legacy domains -> ensure a top-level folder exists for each (id preserved).
  for (const domain of state.domains ?? []) {
    const existing = folderById.get(domain.id);
    if (existing) {
      existing.parentFolderId = undefined;
      existing.weight ??= domain.weight;
    } else {
      const folder: Folder = { id: domain.id, name: domain.name, weight: domain.weight };
      folders.push(folder);
      folderById.set(folder.id, folder);
    }
  }

  // Legacy projects -> ensure a child folder exists for each, parented to its domain folder.
  for (const project of state.projects ?? []) {
    const existing = folderById.get(project.id);
    if (existing) {
      if (folderById.has(project.domainId)) existing.parentFolderId = project.domainId;
      existing.status = project.status === "completed" || project.status === "paused" ? "archived" : existing.status ?? "active";
    } else {
      const folder: Folder = {
        id: project.id,
        name: project.name,
        parentFolderId: folderById.has(project.domainId) ? project.domainId : undefined,
        canBlock: true,
        defaultBlockMinutes: project.defaultBlockMinutes,
        contextNote: project.contextNote,
        status: project.status === "completed" ? "archived" : "active"
      };
      folders.push(folder);
      folderById.set(folder.id, folder);
    }
  }

  // Block selections (T088 2c-A): folderBlockSelections is now canonical (the planner/state
  // block-selection path reads/writes it). projectBlockSelections is derived FROM it at the end of
  // deriveStructureFromFolders for back-compat; we no longer mirror the legacy field back onto it
  // here (that would clobber folder-block edits on the next read).

  // Task placement: projectId ?? domainId is the legacy signal. When it points at an existing folder
  // and disagrees with folderId, the task was moved via legacy fields, so retarget folderId. (The
  // folder-mutation and folderId-write paths keep projectId/domainId in sync, so no false move here.)
  for (const task of state.tasks ?? []) {
    const legacyPlacement = task.projectId ?? task.domainId;
    if (legacyPlacement && legacyPlacement !== task.folderId && folderById.has(legacyPlacement)) {
      task.folderId = legacyPlacement;
    }
  }
}
