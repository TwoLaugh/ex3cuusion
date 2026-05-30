import fs from "node:fs";
import path from "node:path";
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

const globalStore = globalThis as typeof globalThis & { __ex3cuusionRepository?: AppStateRepository };

export function getRepository(): AppStateRepository {
  globalStore.__ex3cuusionRepository ??= process.env.EX3CUUSION_STATE_FILE
    ? new FileAppStateRepository(process.env.EX3CUUSION_STATE_FILE)
    : new InMemoryAppStateRepository();
  return globalStore.__ex3cuusionRepository;
}

export function setRepositoryForTests(repository: AppStateRepository) {
  globalStore.__ex3cuusionRepository = repository;
}

function normalizeState(state: AppState): AppState {
  state.executionEvents ??= [];
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
