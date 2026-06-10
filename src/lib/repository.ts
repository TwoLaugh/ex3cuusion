import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createSeedState } from "./seed";
import type { AppState, Folder, Task } from "./types";

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
  // Live-object cache, mirroring PostgresAppStateRepository: state.ts mutates the object returned
  // by read() in place, so read() must hand back the SAME object every time and flush it to disk
  // (persist-on-read). Re-parsing the file per read silently dropped every in-place mutation.
  private state?: AppState;

  constructor(private readonly filePath: string) {}

  read(): AppState {
    if (this.state) {
      this.persistToDisk(this.state);
      return normalizeState(this.state);
    }
    if (!fs.existsSync(this.filePath)) {
      return this.reset();
    }
    this.state = normalizeState(JSON.parse(fs.readFileSync(this.filePath, "utf8")) as AppState);
    return this.state;
  }

  write(nextState: AppState): AppState {
    this.state = normalizeState(nextState);
    this.persistToDisk(this.state);
    return this.state;
  }

  reset(): AppState {
    return this.write(createSeedState());
  }

  private persistToDisk(state: AppState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
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

export function createFileRepositoryForTests(filePath: string): AppStateRepository {
  return new FileAppStateRepository(filePath);
}

function buildDefaultRepository(): AppStateRepository {
  if (process.env.EX3CUUSION_STATE_REPOSITORY === "postgres") {
    return new PostgresAppStateRepository();
  }
  if (process.env.EX3CUUSION_STATE_REPOSITORY === "memory") {
    return new InMemoryAppStateRepository();
  }
  if (process.env.EX3CUUSION_STATE_FILE) {
    return new FileAppStateRepository(process.env.EX3CUUSION_STATE_FILE);
  }
  // Tests stay hermetic (vitest sets NODE_ENV=test).
  if (process.env.NODE_ENV === "test") {
    return new InMemoryAppStateRepository();
  }
  // Durable by default: a daily-driver planner must survive dev-server restarts. Zero-config
  // file store under .data/ (gitignored). Postgres stays the opt-in production path; set
  // EX3CUUSION_STATE_REPOSITORY=memory for the old throwaway behavior.
  return new FileAppStateRepository(defaultStateFilePath());
}

export function defaultStateFilePath(): string {
  return path.join(process.cwd(), ".data", "state.json");
}

// Legacy shape of a persisted state from before T088 2c-C removed Domain/Project. Used only by the
// forward migration to read old fields off an incoming state without typing them on AppState.
type LegacyDomain = { id: string; name: string; weight?: number };
type LegacyProject = {
  id: string;
  name: string;
  domainId?: string;
  status?: "active" | "paused" | "completed";
  defaultBlockMinutes?: number;
  contextNote?: string;
};
type LegacyProjectBlockSelection = { date: string; projectId: string; selectedTaskIds: string[]; updatedAt: string };
type LegacyTaskFields = { domainId?: string; projectId?: string };
type LegacyAppState = AppState & {
  domains?: LegacyDomain[];
  projects?: LegacyProject[];
  projectBlockSelections?: LegacyProjectBlockSelection[];
  routines?: Array<Record<string, unknown>>;
};

function normalizeState(state: AppState): AppState {
  // T088 2c-C: folders are the only structure. Old persisted states (with domains/projects/
  // task.domainId/projectId/projectBlockSelections) are migrated FORWARD into folders one-way.
  migrateLegacyToFolders(state);

  // Migrate any legacy routine templates (T088) into recurring tasks, then drop the field.
  const legacy = state as LegacyAppState;
  const legacyRoutines = legacy.routines;
  if (Array.isArray(legacyRoutines) && legacyRoutines.length) {
    const folderIds = new Set(state.folders.map((folder) => folder.id));
    for (const routine of legacyRoutines) {
      const routineFolderId = folderIds.has(routine.domainId as string) ? (routine.domainId as string) : undefined;
      const recurrence = (routine.recurrence as { type?: string; days?: number[] }) ?? { type: "daily" };
      state.tasks.push({
        id: `task_${String(routine.id ?? "routine")}`,
        title: String(routine.title ?? "Routine"),
        type: "atomic",
        folderId: routineFolderId,
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
  delete legacy.routines;

  state.executionEvents ??= [];
  state.dailyReviews ??= [];
  state.captureSessions ??= [];
  state.committedPlans ??= []; // T090

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

// T088 2c-C: one-way forward migration. Builds the canonical folder tree from any legacy
// domains/projects on an old saved state, repairs the tree, repoints task.folderId, and DELETES the
// legacy fields so they never linger. Folders are the only structure after this runs.
function migrateLegacyToFolders(state: AppState): void {
  const legacy = state as LegacyAppState;

  // 1. No folders yet but legacy domains exist -> build folders from domains+projects (ids preserved).
  if ((state.folders?.length ?? 0) === 0 && (legacy.domains?.length ?? 0) > 0) {
    const domains = legacy.domains ?? [];
    const projects = legacy.projects ?? [];
    const domainIds = new Set(domains.map((domain) => domain.id));
    state.folders = [
      ...domains.map<Folder>((domain) => ({ id: domain.id, name: domain.name, weight: domain.weight, status: "active" })),
      ...projects.map<Folder>((project) => ({
        id: project.id,
        name: project.name,
        parentFolderId: project.domainId && domainIds.has(project.domainId) ? project.domainId : undefined,
        canBlock: true,
        defaultBlockMinutes: project.defaultBlockMinutes,
        contextNote: project.contextNote,
        status: project.status === "completed" || project.status === "paused" ? "archived" : "active"
      }))
    ];
    for (const task of state.tasks ?? []) {
      const legacyTask = task as Task & LegacyTaskFields;
      task.folderId = legacyTask.projectId ?? legacyTask.domainId;
    }
    state.folderBlockSelections = (legacy.projectBlockSelections ?? []).map((selection) => ({
      date: selection.date,
      folderId: selection.projectId,
      selectedTaskIds: selection.selectedTaskIds,
      updatedAt: selection.updatedAt
    }));
  }

  // 3. Ensure folders is a non-empty array.
  state.folders ??= [];
  if (state.folders.length === 0) {
    state.folders.push({ id: "folder_personal", name: "Personal", weight: 5, status: "active" });
  }

  // 4. Normalize folder tree: parentFolderId pointing at a missing folder -> undefined.
  const folderIds = new Set(state.folders.map((folder) => folder.id));
  for (const folder of state.folders) {
    if (folder.parentFolderId && !folderIds.has(folder.parentFolderId)) folder.parentFolderId = undefined;
  }

  // 5. Every task: a folderId pointing at no existing folder is cleared (task becomes unfiled).
  for (const task of state.tasks ?? []) {
    if (task.folderId && !folderIds.has(task.folderId)) task.folderId = undefined;
  }

  // 6. folderBlockSelections defaulted; drop selections whose folder no longer exists.
  state.folderBlockSelections ??= [];
  state.folderBlockSelections = state.folderBlockSelections.filter((selection) => folderIds.has(selection.folderId));

  // 7. Delete the legacy fields so they don't linger.
  delete legacy.domains;
  delete legacy.projects;
  delete legacy.projectBlockSelections;
  for (const task of state.tasks ?? []) {
    delete (task as Task & LegacyTaskFields).domainId;
    delete (task as Task & LegacyTaskFields).projectId;
  }
}
