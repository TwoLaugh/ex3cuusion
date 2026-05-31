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
