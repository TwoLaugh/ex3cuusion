import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createSeedState } from "./seed";
import type { AppState } from "./types";

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
  deriveFolders(state);
  return state;
}

// T088 Stage 2a: derive the recursive folder tree from domains + projects (ids preserved, so all
// existing references stay valid). Each domain -> a top-level folder; each project -> a child
// folder under its domain; every task gets folderId = projectId ?? domainId. Block selections are
// mirrored onto folders. Stage 2b switches consumers to read these; Stage 2c removes the originals.
function deriveFolders(state: AppState): void {
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
  for (const task of state.tasks) {
    task.folderId = task.projectId ?? task.domainId;
  }
  state.folderBlockSelections = (state.projectBlockSelections ?? []).map((selection) => ({
    date: selection.date,
    folderId: selection.projectId,
    selectedTaskIds: selection.selectedTaskIds,
    updatedAt: selection.updatedAt
  }));
}
