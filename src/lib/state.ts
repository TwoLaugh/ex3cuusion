import { interpretInboxInput } from "./ai-actions";
import { addDays } from "./dates";
import { nextId } from "./ids";
import { buildDayPlan } from "./planner";
import { createRealisticCharacterState } from "./scenarios";
import { createSeedState } from "./seed";
import type { AppState, DeferralReason } from "./types";

const globalStore = globalThis as typeof globalThis & { __ex3cuusionState?: AppState };

function currentState(): AppState {
  globalStore.__ex3cuusionState ??= createSeedState();
  return globalStore.__ex3cuusionState;
}

function replaceState(nextState: AppState): AppState {
  globalStore.__ex3cuusionState = nextState;
  return currentState();
}

export function getState(): AppState {
  return structuredClone(currentState());
}

export function resetState(): AppState {
  replaceState(createSeedState());
  return getState();
}

export function loadRealisticCharacterScenario(): AppState {
  replaceState(createRealisticCharacterState());
  return getState();
}

export function setDate(date: string, time?: string): AppState {
  const state = currentState();
  state.currentDate = date;
  state.currentTime = time ?? state.currentTime;
  return getState();
}

export function setClock(date: string, time: string): AppState {
  const state = currentState();
  state.currentDate = date;
  state.currentTime = time;
  return getState();
}

export function advanceDay(): AppState {
  const state = currentState();
  state.currentDate = addDays(state.currentDate, 1);
  state.currentTime = "08:30";
  return getState();
}

export function retreatDay(): AppState {
  const state = currentState();
  state.currentDate = addDays(state.currentDate, -1);
  state.currentTime = "08:30";
  return getState();
}

export function completePlanItem(planItemId: string, actualMinutes?: number): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

  const existing = state.completions.find((event) => event.date === state.currentDate && event.planItemId === planItemId);
  if (existing) {
    state.completions = state.completions.filter((event) => event !== existing);
    return getState();
  }

  state.deferrals = state.deferrals.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
  state.completions.push({
    id: nextId("completion"),
    date: state.currentDate,
    planItemId,
    actualMinutes
  });

  return getState();
}

export function deferPlanItem(planItemId: string, reason: DeferralReason, note?: string): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

  const existing = state.deferrals.find((event) => event.date === state.currentDate && event.planItemId === planItemId);
  if (existing) {
    state.deferrals = state.deferrals.filter((event) => event !== existing);
    return getState();
  }

  state.completions = state.completions.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
  state.deferrals.push({
    id: nextId("deferral"),
    date: state.currentDate,
    planItemId,
    reason,
    note
  });

  return getState();
}

export async function submitInbox(input: string): Promise<AppState> {
  const state = currentState();
  const entry = await interpretInboxInput(input, state);
  for (const action of entry.actions) {
    if (action.safety !== "auto_apply") {
      action.skippedReason = "Needs confirmation before applying.";
      continue;
    }
    if (action.type === "create_task") {
      const task = {
        id: nextId("task"),
        ...(action.payload as Omit<AppState["tasks"][number], "id">)
      };
      state.tasks.push(task);
      action.status = "applied";
      action.appliedEntityId = task.id;
    }
    if (action.type === "create_routine") {
      const title = String(action.payload.title);
      const exists = state.routines.some((routine) => routine.title.toLowerCase() === title.toLowerCase());
      if (!exists) {
        const routine = {
          id: nextId("routine"),
          ...(action.payload as Omit<AppState["routines"][number], "id" | "active">),
          active: true
        };
        state.routines.push(routine);
        action.appliedEntityId = routine.id;
      } else {
        action.skippedReason = "Routine already exists.";
      }
      action.status = "applied";
    }
  }

  state.inbox.unshift(entry);
  return getState();
}
