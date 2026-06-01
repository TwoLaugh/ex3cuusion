import { interpretCaptureRevision, interpretInboxInput, type AiInterpreter, type AiRevisionInterpreter, type CaptureRevision } from "./ai-actions";
import { addDays, nextWeekRange, weekRange } from "./dates";
import { nextId } from "./ids";
import { buildDayPlan } from "./planner";
import { getRepository } from "./repository";
import { createRealisticCharacterState } from "./scenarios";
import type {
  AiAction,
  AppState,
  BlockedMetadata,
  CaptureSession,
  ClarificationKind,
  ClarificationQuestion,
  DailyReviewEnergy,
  DailyReviewPlanFit,
  DeferralReason,
  ExecutionEvent,
  ExecutionEventType,
  Task,
  WaitingMetadata
} from "./types";

export type StructureMutation =
  | { entity: "domain"; action: "create"; patch: Partial<AppState["domains"][number]> }
  | { entity: "domain"; action: "update"; id: string; patch: Partial<AppState["domains"][number]> }
  | { entity: "project"; action: "create"; patch: Partial<AppState["projects"][number]> }
  | { entity: "project"; action: "update"; id: string; patch: Partial<AppState["projects"][number]> }
  | { entity: "project"; action: "archive"; id: string }
  | { entity: "task"; action: "create"; patch: Partial<Task> }
  | { entity: "task"; action: "update"; id: string; patch: Partial<Task> }
  | { entity: "task"; action: "archive"; id: string }
  | { entity: "routine"; action: "create"; patch: Partial<AppState["routines"][number]> }
  | { entity: "routine"; action: "update"; id: string; patch: Partial<AppState["routines"][number]> }
  | { entity: "routine"; action: "archive"; id: string };

export type ProjectBlockSelectionAction = "add" | "remove" | "regenerate";

export interface DailyReviewSummary {
  date: string;
  completedCount: number;
  partialCount: number;
  deferredCount: number;
  blockedCount: number;
  skippedCount: number;
  completedTitles: string[];
  partialTitles: string[];
  deferredTitles: string[];
  blockedTitles: string[];
  skippedTitles: string[];
  calibrationSignals: string[];
  existingReview?: AppState["dailyReviews"][number];
}

export interface DailyReviewInput {
  date?: string;
  energy: DailyReviewEnergy;
  planFit: DailyReviewPlanFit;
  note?: string;
  affectPlanning?: boolean;
}

function currentState(): AppState {
  return getRepository().read();
}

function replaceState(nextState: AppState): AppState {
  return getRepository().write(nextState);
}

export function getState(): AppState {
  return structuredClone(currentState());
}

export function resetState(): AppState {
  getRepository().reset();
  clearChangeHistory();
  return getState();
}

// --- AI change history & undo (T061) -------------------------------------------------------
// Apply model: auto-apply with undo. Before any AI operation mutates state we snapshot the
// prior state; undo restores it. History is kept OUTSIDE AppState so it never leaks into the
// model context or state serialization. In-memory/per-process (not persisted to Postgres yet).

interface ChangeHistoryEntry {
  id: string;
  source: string;
  summary: string;
  createdAt: string;
  snapshot: AppState;
}

const MAX_CHANGE_HISTORY = 50;
const globalHistoryStore = globalThis as typeof globalThis & { __ex3cuusionChangeHistory?: ChangeHistoryEntry[] };

function changeHistory(): ChangeHistoryEntry[] {
  globalHistoryStore.__ex3cuusionChangeHistory ??= [];
  return globalHistoryStore.__ex3cuusionChangeHistory;
}

function clearChangeHistory(): void {
  globalHistoryStore.__ex3cuusionChangeHistory = [];
}

function changeTimestamp(state: AppState): string {
  return new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
}

// Snapshot the current state BEFORE an AI operation mutates it, so the operation is reversible.
function recordChange(source: string, summary: string): void {
  const state = currentState();
  const history = changeHistory();
  history.push({ id: nextId("history"), source, summary, createdAt: changeTimestamp(state), snapshot: structuredClone(state) });
  while (history.length > MAX_CHANGE_HISTORY) history.shift();
}

export interface ChangeHistoryItem {
  id: string;
  source: string;
  summary: string;
  createdAt: string;
}

export function listChangeHistory(): ChangeHistoryItem[] {
  return changeHistory()
    .map((entry) => ({ id: entry.id, source: entry.source, summary: entry.summary, createdAt: entry.createdAt }))
    .reverse();
}

// Restore the snapshot captured before the given change (or the most recent change), undoing it
// and any later changes (LIFO rewind).
export function undoChange(id?: string): AppState {
  const history = changeHistory();
  if (!history.length) return getState();
  const index = id ? history.findIndex((entry) => entry.id === id) : history.length - 1;
  if (index < 0) return getState();
  replaceState(structuredClone(history[index].snapshot));
  history.splice(index);
  return getState();
}

function summarizeInbox(input: string): string {
  const trimmed = input.trim();
  return `Inbox: ${trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed}`;
}

export function loadRealisticCharacterScenario(): AppState {
  replaceState(createRealisticCharacterState());
  return getState();
}

export function applyStructureMutation(mutation: StructureMutation): AppState {
  const state = currentState();

  if (mutation.entity === "domain") {
    if (mutation.action === "create") {
      state.domains.push({
        id: uniqueStateId(state, "domain"),
        name: cleanText(mutation.patch.name) || "New domain",
        weight: clampNumber(mutation.patch.weight, 1, 10, 5)
      });
      return getState();
    }

    const domain = state.domains.find((entry) => entry.id === mutation.id);
    if (!domain) return getState();
    domain.name = cleanText(mutation.patch.name) || domain.name;
    domain.weight = clampNumber(mutation.patch.weight, 1, 10, domain.weight);
    return getState();
  }

  if (mutation.entity === "project") {
    if (mutation.action === "create") {
      const domainId = validDomainId(state, mutation.patch.domainId) ?? state.domains[0]?.id;
      if (!domainId) return getState();
      state.projects.push({
        id: uniqueStateId(state, "project"),
        domainId,
        name: cleanText(mutation.patch.name) || "New project",
        kind: validProjectKind(mutation.patch.kind) ?? "project",
        planningMode: validPlanningMode(mutation.patch.planningMode) ?? "open_backlog",
        status: validProjectStatus(mutation.patch.status) ?? "active",
        priorityWeight: clampNumber(mutation.patch.priorityWeight, 1, 10, 5),
        defaultBlockMinutes: clampNumber(mutation.patch.defaultBlockMinutes, 5, 480, 60),
        contextNote: cleanText(mutation.patch.contextNote)
      });
      return getState();
    }

    const project = state.projects.find((entry) => entry.id === mutation.id);
    if (!project) return getState();
    if (mutation.action === "archive") {
      project.status = "paused";
      for (const task of state.tasks.filter((entry) => entry.projectId === project.id)) {
        task.projectId = undefined;
        task.type = task.type === "project_task" ? "atomic" : task.type;
      }
      return getState();
    }

    project.domainId = validDomainId(state, mutation.patch.domainId) ?? project.domainId;
    project.name = cleanText(mutation.patch.name) || project.name;
    project.kind = validProjectKind(mutation.patch.kind) ?? project.kind;
    project.planningMode = validPlanningMode(mutation.patch.planningMode) ?? project.planningMode;
    project.status = validProjectStatus(mutation.patch.status) ?? project.status;
    project.priorityWeight = clampNumber(mutation.patch.priorityWeight, 1, 10, project.priorityWeight);
    project.defaultBlockMinutes = clampNumber(mutation.patch.defaultBlockMinutes, 5, 480, project.defaultBlockMinutes);
    project.contextNote = cleanText(mutation.patch.contextNote ?? project.contextNote);
    if (mutation.patch.domainId) {
      for (const task of state.tasks.filter((entry) => entry.projectId === project.id)) {
        task.domainId = project.domainId;
      }
    }
    return getState();
  }

  if (mutation.entity === "task") {
    if (mutation.action === "create") {
      const domainId = validDomainId(state, mutation.patch.domainId) ?? state.domains[0]?.id;
      if (!domainId) return getState();
      const projectId = validProjectId(state, mutation.patch.projectId);
      state.tasks.push({
        id: uniqueStateId(state, "task"),
        title: cleanText(mutation.patch.title) || "New task",
        description: cleanText(mutation.patch.description) || undefined,
        type: projectId ? "project_task" : validTaskType(mutation.patch.type) ?? "atomic",
        domainId: projectId ? state.projects.find((project) => project.id === projectId)!.domainId : domainId,
        projectId,
        status: validTaskStatus(mutation.patch.status) ?? "active",
        repeatPolicy: normalizeRepeatPolicy(mutation.patch.repeatPolicy),
        completionBehavior: validCompletionBehavior(mutation.patch.completionBehavior) ?? "exhaust_once",
        completionMode: validCompletionMode(mutation.patch.completionMode) ?? "simple_done",
        definitionOfDone: cleanText(mutation.patch.definitionOfDone) || undefined,
        plannerFields: {
          intentType: mutation.patch.plannerFields?.intentType ?? "obligation",
          pressureLevel: mutation.patch.plannerFields?.pressureLevel ?? (mutation.patch.dueDate ? "due" : "soft"),
          location: mutation.patch.plannerFields?.location,
          setupCost: mutation.patch.plannerFields?.setupCost
        },
        plannerSignals: mutation.patch.plannerSignals,
        tags: mutation.patch.tags,
        fieldConfidence: mutation.patch.fieldConfidence,
        priority: clampNumber(mutation.patch.priority, 1, 10, 3),
        importance: clampNumber(mutation.patch.importance, 1, 10, 3),
        urgency: clampNumber(mutation.patch.urgency, 1, 10, 3),
        dueDate: validDate(mutation.patch.dueDate) ? mutation.patch.dueDate : undefined,
        scheduledDate: validDate(mutation.patch.scheduledDate) ? mutation.patch.scheduledDate : undefined,
        scheduledTime: validTime(mutation.patch.scheduledTime) ? mutation.patch.scheduledTime : undefined,
        dateIntent: mutation.patch.dateIntent,
        scheduling: mutation.patch.scheduling,
        effortMinutes: clampNumber(mutation.patch.effortMinutes, 1, 720, 30),
        minMinutes: mutation.patch.minMinutes,
        maxMinutes: mutation.patch.maxMinutes,
        estimateConfidence: mutation.patch.estimateConfidence,
        energy: validEnergy(mutation.patch.energy) ?? "medium",
        strictness: validStrictness(mutation.patch.strictness) ?? "normal",
        notes: cleanText(mutation.patch.notes) || undefined,
        source: "manual"
      });
      return getState();
    }

    const task = state.tasks.find((entry) => entry.id === mutation.id);
    if (!task) return getState();
    if (mutation.action === "archive") {
      task.status = "archived";
      return getState();
    }

    const projectId = mutation.patch.projectId === "" ? undefined : validProjectId(state, mutation.patch.projectId);
    if (mutation.patch.projectId !== undefined) {
      task.projectId = projectId;
      if (projectId) {
        const project = state.projects.find((entry) => entry.id === projectId)!;
        task.domainId = project.domainId;
        task.type = task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "project_task";
      } else if (task.type === "project_task") {
        task.type = "atomic";
      }
    } else {
      task.domainId = validDomainId(state, mutation.patch.domainId) ?? task.domainId;
    }
    if (!task.projectId) task.domainId = validDomainId(state, mutation.patch.domainId) ?? task.domainId;
    task.title = cleanText(mutation.patch.title) || task.title;
    task.description = optionalText(mutation.patch.description, task.description);
    task.status = validTaskStatus(mutation.patch.status) ?? task.status;
    task.completionBehavior = validCompletionBehavior(mutation.patch.completionBehavior) ?? task.completionBehavior;
    task.completionMode = validCompletionMode(mutation.patch.completionMode) ?? task.completionMode;
    task.definitionOfDone = optionalText(mutation.patch.definitionOfDone, task.definitionOfDone);
    task.priority = clampNumber(mutation.patch.priority, 1, 10, task.priority);
    task.importance = clampNumber(mutation.patch.importance, 1, 10, task.importance);
    task.urgency = clampNumber(mutation.patch.urgency, 1, 10, task.urgency);
    task.effortMinutes = clampNumber(mutation.patch.effortMinutes, 1, 720, task.effortMinutes);
    task.dueDate = mutation.patch.dueDate === "" ? undefined : validDate(mutation.patch.dueDate) ? mutation.patch.dueDate : task.dueDate;
    task.scheduledDate =
      mutation.patch.scheduledDate === "" ? undefined : validDate(mutation.patch.scheduledDate) ? mutation.patch.scheduledDate : task.scheduledDate;
    task.scheduledTime =
      mutation.patch.scheduledTime === "" ? undefined : validTime(mutation.patch.scheduledTime) ? mutation.patch.scheduledTime : task.scheduledTime;
    task.energy = validEnergy(mutation.patch.energy) ?? task.energy;
    task.strictness = validStrictness(mutation.patch.strictness) ?? task.strictness;
    task.notes = optionalText(mutation.patch.notes, task.notes);
    task.repeatPolicy = mutation.patch.repeatPolicy ? normalizeRepeatPolicy(mutation.patch.repeatPolicy) : task.repeatPolicy;
    return getState();
  }

  if (mutation.entity === "routine") {
    if (mutation.action === "create") {
      const domainId = validDomainId(state, mutation.patch.domainId) ?? state.domains[0]?.id;
      if (!domainId) return getState();
      state.routines.push({
        id: uniqueStateId(state, "routine"),
        title: cleanText(mutation.patch.title) || "New routine",
        domainId,
        recurrence: normalizeRoutineRecurrence(mutation.patch.recurrence),
        defaultEffortMinutes: clampNumber(mutation.patch.defaultEffortMinutes, 1, 240, 20),
        energy: validEnergy(mutation.patch.energy) ?? "low",
        strictness: validStrictness(mutation.patch.strictness) ?? "normal",
        preferredWindow: validPreferredWindow(mutation.patch.preferredWindow),
        active: mutation.patch.active ?? true
      });
      return getState();
    }

    const routine = state.routines.find((entry) => entry.id === mutation.id);
    if (!routine) return getState();
    if (mutation.action === "archive") {
      routine.active = false;
      return getState();
    }
    routine.title = cleanText(mutation.patch.title) || routine.title;
    routine.domainId = validDomainId(state, mutation.patch.domainId) ?? routine.domainId;
    routine.recurrence = mutation.patch.recurrence ? normalizeRoutineRecurrence(mutation.patch.recurrence) : routine.recurrence;
    routine.defaultEffortMinutes = clampNumber(mutation.patch.defaultEffortMinutes, 1, 240, routine.defaultEffortMinutes);
    routine.energy = validEnergy(mutation.patch.energy) ?? routine.energy;
    routine.strictness = validStrictness(mutation.patch.strictness) ?? routine.strictness;
    routine.preferredWindow =
      cleanText(mutation.patch.preferredWindow) === "" ? undefined : validPreferredWindow(mutation.patch.preferredWindow) ?? routine.preferredWindow;
    routine.active = mutation.patch.active ?? routine.active;
    return getState();
  }

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

export function dailyReviewSummary(date?: string): DailyReviewSummary {
  return buildDailyReviewSummary(currentState(), date);
}

export function submitDailyReview(input: DailyReviewInput): AppState {
  const state = currentState();
  const date = input.date ?? state.currentDate;
  const summary = buildDailyReviewSummary(state, date);
  const affectPlanning = input.affectPlanning ?? true;
  const capacityAdjustmentMinutes = affectPlanning ? dailyReviewCapacityAdjustment(input.energy, input.planFit, summary) : 0;
  const review = {
    id: state.dailyReviews.find((entry) => entry.date === date)?.id ?? nextId("review"),
    date,
    createdAt: timestampForState(state),
    energy: input.energy,
    planFit: input.planFit,
    note: cleanText(input.note).slice(0, 280) || undefined,
    affectPlanning,
    capacityAdjustmentMinutes,
    completedCount: summary.completedCount,
    partialCount: summary.partialCount,
    deferredCount: summary.deferredCount,
    blockedCount: summary.blockedCount,
    skippedCount: summary.skippedCount,
    calibrationSignals: reviewCalibrationSignals(input.energy, input.planFit, summary)
  };

  state.dailyReviews = [
    ...state.dailyReviews.filter((entry) => entry.date !== date),
    review
  ].sort((a, b) => a.date.localeCompare(b.date));

  return getState();
}

export function updateProjectBlockSelection(input: {
  planItemId: string;
  taskId?: string;
  action: ProjectBlockSelectionAction;
}): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === input.planItemId);
  if (!item || item.type !== "project_block" || !item.projectId) return getState();

  state.projectBlockSelections ??= [];
  const existing = state.projectBlockSelections.find(
    (selection) => selection.date === state.currentDate && selection.projectId === item.projectId
  );

  if (input.action === "regenerate") {
    state.projectBlockSelections = state.projectBlockSelections.filter(
      (selection) => !(selection.date === state.currentDate && selection.projectId === item.projectId)
    );
    return getState();
  }

  const currentSelection = existing?.selectedTaskIds ?? item.selectedTaskIds ?? [];
  let nextSelection = currentSelection;

  if (input.action === "add" && input.taskId && isSelectableProjectTask(state, item.projectId, input.taskId)) {
    nextSelection = [...currentSelection, input.taskId].filter((taskId, index, all) => all.indexOf(taskId) === index);
  }

  if (input.action === "remove" && input.taskId) {
    nextSelection = currentSelection.filter((taskId) => taskId !== input.taskId);
  }

  if (existing) {
    existing.selectedTaskIds = nextSelection;
    existing.updatedAt = timestampForState(state);
  } else {
    state.projectBlockSelections.push({
      date: state.currentDate,
      projectId: item.projectId,
      selectedTaskIds: nextSelection,
      updatedAt: timestampForState(state)
    });
  }

  return getState();
}

export function completePlanItem(planItemId: string, actualMinutes?: number, completedTaskIds?: string[]): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

  if (item.type === "project_block" && !completedTaskIds?.length) {
    const existing = state.completions.find(
      (event) => event.date === state.currentDate && event.planItemId === planItemId && (!event.taskIds || event.taskIds.length === 0)
    );
    if (existing) {
      state.completions = state.completions.filter((event) => event !== existing);
      state.executionEvents = state.executionEvents.filter(
        (event) => !(event.date === state.currentDate && event.planItemId === planItemId && event.type === "completed" && !event.taskIds?.length)
      );
      return getState();
    }
    state.deferrals = state.deferrals.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
    state.completions.push({
      id: nextId("completion"),
      date: state.currentDate,
      planItemId,
      taskIds: [],
      actualMinutes
    });
    addExecutionEvent(state, {
      type: "completed",
      planItemId,
      actualMinutes
    });
    return getState();
  }

  if (item.type === "project_block" && completedTaskIds?.length) {
    for (const taskId of completedTaskIds) {
      if (removeTaskCompletion(state, planItemId, taskId)) {
        restoreTasksForUndoneCompletion(state, [taskId]);
      } else {
        markTasksCompleted(state, [taskId]);
        state.completions.push({
          id: nextId("completion"),
          date: state.currentDate,
          planItemId,
          taskIds: [taskId],
          actualMinutes
        });
        addExecutionEvent(state, {
          type: "completed",
          planItemId,
          taskIds: [taskId],
          actualMinutes
        });
      }
    }
    return getState();
  }

  const existing = state.completions.find((event) => event.date === state.currentDate && event.planItemId === planItemId);
  if (existing) {
    state.completions = state.completions.filter((event) => event !== existing);
    state.executionEvents = state.executionEvents.filter(
      (event) => !(event.date === state.currentDate && event.planItemId === planItemId && event.type === "completed")
    );
    restoreTasksForUndoneCompletion(state, existing.taskIds ?? []);
    return getState();
  }

  state.deferrals = state.deferrals.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
  const taskIds = taskIdsCompletedByPlanItem(item, completedTaskIds);
  markTasksCompleted(state, taskIds);
  state.completions.push({
    id: nextId("completion"),
    date: state.currentDate,
    planItemId,
    taskIds,
    actualMinutes
  });
  addExecutionEvent(state, {
    type: "completed",
    planItemId,
    taskIds,
    actualMinutes
  });

  return getState();
}

export function deferPlanItem(planItemId: string, reason: DeferralReason, note?: string, deferredTo?: string): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

  const existing = state.deferrals.find((event) => event.date === state.currentDate && event.planItemId === planItemId);
  if (existing) {
    state.deferrals = state.deferrals.filter((event) => event !== existing);
    return getState();
  }

  const removedCompletions = state.completions.filter((event) => event.date === state.currentDate && event.planItemId === planItemId);
  state.completions = state.completions.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
  for (const event of removedCompletions) {
    restoreTasksForUndoneCompletion(state, event.taskIds ?? []);
  }
  state.deferrals.push({
    id: nextId("deferral"),
    date: state.currentDate,
    planItemId,
    reason,
    note
  });
  addExecutionEvent(state, {
    type: "deferred",
    planItemId,
    taskId: item.taskId,
    taskIds: item.selectedTaskIds,
    reason,
    note
  });

  if (item.taskId && deferredTo) {
    const task = state.tasks.find((entry) => entry.id === item.taskId);
    if (task) {
      task.status = "scheduled";
      task.scheduledDate = deferredTo;
    }
  }

  return getState();
}

export function recordPlanItemOutcome(input: {
  planItemId: string;
  type: ExecutionEventType;
  reason?: ExecutionEvent["reason"];
  note?: string;
  actualMinutes?: number;
  nextAction?: string;
  blocked?: BlockedMetadata;
  waiting?: WaitingMetadata;
}): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === input.planItemId);
  if (!item) return getState();

  const taskIds = item.taskId ? [item.taskId] : item.selectedTaskIds ?? [];
  addExecutionEvent(state, {
    type: input.type,
    planItemId: input.planItemId,
    taskId: item.taskId,
    taskIds,
    reason: input.reason,
    note: input.note,
    actualMinutes: input.actualMinutes,
    nextAction: input.nextAction,
    blocked: input.blocked,
    waiting: input.waiting
  });

  for (const taskId of taskIds) {
    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) continue;
    applyOutcomeToTask(task, input);
  }

  if (input.type === "deferred") {
    state.deferrals.push({
      id: nextId("deferral"),
      date: state.currentDate,
      planItemId: input.planItemId,
      reason: normalizeDeferralReason(input.reason),
      note: input.note
    });
  }

  return getState();
}

export async function submitInbox(input: string, interpreter?: AiInterpreter): Promise<AppState> {
  recordChange("inbox", summarizeInbox(input));
  const state = currentState();
  const entry = await interpretInboxInput(input, state, interpreter);
  const session = buildCaptureSession(state, input, entry);
  entry.captureSessionId = session.id;
  for (const action of entry.actions) {
    action.captureSessionId = session.id;
    action.sourceMessageId = entry.id;
    if (action.type === "ask_clarification") {
      pushUnique(session.draftActionIds, action.id);
      const question = buildClarificationQuestion(state, action);
      action.pendingQuestionId = question.id;
      session.questions.push(question);
      session.unresolvedFields.push(question.kind);
      session.messages.push({
        id: nextId("message"),
        role: "assistant",
        content: question.question,
        createdAt: timestampForState(state)
      });
    }
    session.actionIds.push(action.id);
  }

  // Apply create_project before create_task so tasks can link to a work-block created in the
  // same message (T062 grouping). Display order (entry.actions) is preserved separately.
  const applyOrder = [...entry.actions].sort((left, right) => applyRank(left) - applyRank(right));
  for (const action of applyOrder) {
    applyAutoAction(state, action, input);
    recordAppliedEntity(session, action);
  }
  session.status = session.questions.some((question) => question.status === "pending")
    ? "waiting_for_user"
    : entry.actions.every((action) => action.status === "applied")
      ? "applied"
      : "open";
  session.updatedAt = timestampForState(state);

  state.inbox.unshift(entry);
  state.captureSessions.unshift(session);
  return getState();
}

export function answerCaptureQuestion(sessionId: string, questionId: string, answer: string): AppState {
  const state = currentState();
  const session = state.captureSessions.find((candidate) => candidate.id === sessionId);
  const question = session?.questions.find((candidate) => candidate.id === questionId);
  if (!session || !question || question.status !== "pending") return getState();
  const action = findAction(state, question.actionId);
  if (!action || action.type !== "ask_clarification") return getState();

  recordChange("clarification", `Answered: ${answer.length > 50 ? `${answer.slice(0, 47)}...` : answer}`);
  question.status = "answered";
  question.answer = answer;
  question.answeredAt = timestampForState(state);
  const draftAction = buildActionFromClarification(state, session, action, question, answer);
  action.status = "applied";
  action.skippedReason = `Answered: ${answer}`;
  appendActionToInboxEntry(state, action.sourceMessageId, draftAction);
  session.actionIds.push(draftAction.id);
  pushUnique(session.draftActionIds, draftAction.id);
  session.messages.push({
    id: nextId("message"),
    role: "user",
    content: answer,
    createdAt: timestampForState(state)
  });
  session.unresolvedFields = session.unresolvedFields.filter((field) => field !== question.kind);
  pushUnique(session.answeredFields, question.kind);
  applyAutoAction(state, draftAction);
  recordAppliedEntity(session, draftAction);
  recordRevisionEvent(state, session, {
    source: "clarification_answer",
    actionId: draftAction.id,
    taskId: draftAction.appliedEntityId,
    model: draftAction.model,
    summary: `Answered ${question.kind}.`,
    changes: [`answered ${question.kind}`],
    after: taskSnapshotById(state, draftAction.appliedEntityId)
  });
  session.status = session.questions.some((candidate) => candidate.status === "pending") ? "waiting_for_user" : "applied";
  session.updatedAt = timestampForState(state);
  return getState();
}

export async function addCaptureSessionMessage(sessionId: string, message: string, interpreter?: AiRevisionInterpreter): Promise<AppState> {
  const state = currentState();
  const session = state.captureSessions.find((candidate) => candidate.id === sessionId);
  const trimmed = message.trim();
  if (!session || !trimmed || session.status === "dismissed") return getState();

  recordChange("capture", `Capture follow-up: ${trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed}`);
  session.messages.push({
    id: nextId("message"),
    role: "user",
    content: trimmed,
    createdAt: timestampForState(state)
  });

  const pendingQuestion = session.questions.find((question) => question.status === "pending");
  if (pendingQuestion && !looksLikeRevision(trimmed)) {
    const action = findAction(state, pendingQuestion.actionId);
    if (action?.type === "ask_clarification") {
      pendingQuestion.status = "answered";
      pendingQuestion.answer = trimmed;
      pendingQuestion.answeredAt = timestampForState(state);
      const draftAction = buildActionFromClarification(state, session, action, pendingQuestion, trimmed);
      action.status = "applied";
      action.skippedReason = `Answered: ${trimmed}`;
      appendActionToInboxEntry(state, action.sourceMessageId, draftAction);
      session.actionIds.push(draftAction.id);
      pushUnique(session.draftActionIds, draftAction.id);
      session.unresolvedFields = session.unresolvedFields.filter((field) => field !== pendingQuestion.kind);
      pushUnique(session.answeredFields, pendingQuestion.kind);
      applyAutoAction(state, draftAction);
      recordAppliedEntity(session, draftAction);
      recordRevisionEvent(state, session, {
        source: "clarification_answer",
        actionId: draftAction.id,
        taskId: draftAction.appliedEntityId,
        model: draftAction.model,
        summary: `Answered ${pendingQuestion.kind}.`,
        changes: [`answered ${pendingQuestion.kind}`],
        after: taskSnapshotById(state, draftAction.appliedEntityId)
      });
      session.status = session.questions.some((candidate) => candidate.status === "pending") ? "waiting_for_user" : "applied";
      addAssistantSessionMessage(state, session, `Applied that answer to ${String(draftAction.payload.title ?? "the draft")}.`);
      session.updatedAt = timestampForState(state);
      return getState();
    }
  }

  const target = findSessionTaskTarget(state, session);
  if (!target) {
    addAssistantSessionMessage(state, session, "I kept that note with the capture, but there is no task draft to update yet.");
    session.updatedAt = timestampForState(state);
    return getState();
  }

  const duplicatePrune = archiveDuplicateTasksForFollowUp(state, target.task, trimmed);
  if (duplicatePrune.length) {
    if (target.action) target.action.payload = { ...target.action.payload, ...taskActionPatch(target.task) };
    recordRevisionEvent(state, session, {
      source: "follow_up",
      actionId: target.action?.id,
      taskId: target.task.id,
      model: "deterministic",
      confidence: 0.9,
      summary: `Removed ${duplicatePrune.length} duplicate task${duplicatePrune.length === 1 ? "" : "s"}.`,
      changes: duplicatePrune.map((task) => `archived duplicate ${task.title}`),
      after: taskSnapshot(target.task)
    });
    addAssistantSessionMessage(
      state,
      session,
      `Kept ${target.task.title} and removed duplicate${duplicatePrune.length === 1 ? "" : "s"}: ${duplicatePrune.map((task) => task.title).join(", ")}.`
    );
    session.updatedAt = timestampForState(state);
    return getState();
  }

  let changes: string[];
  let summary: string | undefined;
  let revisionMeta: Partial<Pick<CaptureRevision, "model" | "confidence">> = {};
  const before = taskSnapshot(target.task);
  try {
    const revision = await interpretCaptureRevision(trimmed, state, session, target.task, interpreter);
    changes = applyRevisionToTask(state, target.task, revision, trimmed);
    summary = revision.summary;
    revisionMeta = { model: revision.model, confidence: revision.confidence };
  } catch (error) {
    changes = applyFollowUpToTask(state, target.task, trimmed);
    summary = error instanceof Error ? `I used the local fallback because the AI revision failed: ${error.message}` : undefined;
    revisionMeta = { model: "fallback", confidence: 0.4 };
  }
  if (target.action) target.action.payload = { ...target.action.payload, ...taskActionPatch(target.task) };
  recordRevisionEvent(state, session, {
    source: revisionMeta.model === "fallback" ? "fallback" : "follow_up",
    actionId: target.action?.id,
    taskId: target.task.id,
    model: revisionMeta.model,
    confidence: revisionMeta.confidence,
    summary: summary || "Follow-up applied.",
    changes,
    before,
    after: taskSnapshot(target.task)
  });
  addAssistantSessionMessage(
    state,
    session,
    changes.length ? `Updated ${target.task.title}: ${changes.join(", ")}.` : summary || `Kept that note on ${target.task.title}.`
  );
  session.updatedAt = timestampForState(state);
  return getState();
}

export function dismissCaptureSession(sessionId: string): AppState {
  const state = currentState();
  const session = state.captureSessions.find((candidate) => candidate.id === sessionId);
  if (!session) return getState();
  session.status = "dismissed";
  session.updatedAt = timestampForState(state);
  for (const question of session.questions) {
    if (question.status === "pending") question.status = "dismissed";
  }
  for (const actionId of session.actionIds) {
    const action = findAction(state, actionId);
    if (action?.status === "proposed") {
      action.status = "rejected";
      action.skippedReason = "Capture session dismissed.";
    }
  }
  return getState();
}

export function applyCaptureSession(sessionId: string): AppState {
  const state = currentState();
  const session = state.captureSessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.status === "dismissed") return getState();
  for (const actionId of session.actionIds) {
    const action = findAction(state, actionId);
    if (!action || action.type === "ask_clarification" || action.status !== "proposed") continue;
    if (action.validationErrors?.length) {
      action.status = "failed";
      action.skippedReason = "Cannot apply until validation errors are resolved.";
      continue;
    }
    applyAction(state, action, true);
  }
  session.status = session.questions.some((question) => question.status === "pending") ? "waiting_for_user" : "applied";
  session.updatedAt = timestampForState(state);
  return getState();
}

export function confirmAiAction(actionId: string): AppState {
  const state = currentState();
  const action = findAction(state, actionId);
  if (!action || action.status !== "proposed") return getState();
  if (action.validationErrors?.length) {
    action.status = "failed";
    action.skippedReason = "Cannot confirm until validation errors are resolved.";
    return getState();
  }
  applyAction(state, action, true);
  return getState();
}

export function rejectAiAction(actionId: string, reason?: string): AppState {
  const state = currentState();
  const action = findAction(state, actionId);
  if (!action || action.status !== "proposed") return getState();
  action.status = "rejected";
  action.skippedReason = reason || "Rejected by user.";
  return getState();
}

function applyRank(action: AiAction): number {
  // create_project must run before create_task so same-batch tasks can link to it (T062).
  return action.type === "create_project" ? 0 : 1;
}

function clampTaskScore(value: number): number {
  return Math.max(1, Math.min(9, Math.round(value)));
}

// Apply a backlog/grooming date-intent change to an existing task (T064): promote, demote to
// someday, or move to a week window. "unchanged"/undefined leaves dates untouched.
function applyTaskDateIntent(state: AppState, task: Task, kind: string | undefined, scheduledDate?: string, dueDate?: string): void {
  if (!kind || kind === "unchanged") return;
  const today = state.currentDate;
  if (kind === "today" || kind === "tomorrow") {
    const date = kind === "today" ? today : addDays(today, 1);
    task.scheduledDate = date;
    task.scheduledTime = undefined;
    task.plannerFields.pressureLevel = "scheduled";
    task.dateIntent = { kind, scheduledDate: date, confidence: 0.8 };
  } else if (kind === "this_week" || kind === "next_week") {
    const range = kind === "this_week" ? weekRange(today) : nextWeekRange(today);
    task.scheduledDate = undefined;
    task.plannerFields.pressureLevel = "soft";
    task.dateIntent = { kind: "week_window", startDate: range.startDate, endDate: range.endDate, confidence: 0.7 };
  } else if (kind === "someday") {
    task.scheduledDate = undefined;
    task.dueDate = undefined;
    task.scheduledTime = undefined;
    task.plannerFields.pressureLevel = "someday";
    task.dateIntent = { kind: "someday", confidence: 0.6 };
  } else if (kind === "specific_date" && scheduledDate) {
    task.scheduledDate = scheduledDate;
    task.plannerFields.pressureLevel = "scheduled";
    task.dateIntent = { kind: "specific_date", scheduledDate, confidence: 0.7 };
  } else if (kind === "deadline" && dueDate) {
    task.dueDate = dueDate;
    task.scheduledDate = undefined;
    task.plannerFields.pressureLevel = "due";
    task.dateIntent = { kind: "deadline", dueDate, confidence: 0.7 };
  }
}

// Resolve a create_task's intended project name to a real projectId at apply time — covers a
// work-block created earlier in the same batch (T062 grouping).
function linkPendingProject(state: AppState, action: AiAction, payload: Omit<Task, "id">): void {
  if (payload.projectId || !action.pendingProjectName) return;
  const target = action.pendingProjectName.toLowerCase();
  const project = state.projects.find(
    (candidate) =>
      candidate.status !== "completed" &&
      (candidate.name.toLowerCase() === target ||
        candidate.name.toLowerCase().includes(target) ||
        target.includes(candidate.name.toLowerCase()))
  );
  if (!project) return;
  payload.projectId = project.id;
  payload.type = "project_task";
  payload.domainId = project.domainId;
}

function applyAutoAction(state: AppState, action: AiAction, sourceText?: string) {
  if (action.status === "failed") return;
  if (action.safety !== "auto_apply") {
    action.skippedReason = action.validationErrors?.length
      ? action.validationErrors.join(" ")
      : "Needs confirmation before applying.";
    return;
  }
  applyAction(state, action, false, sourceText);
}

function applyAction(state: AppState, action: AiAction, confirmed: boolean, sourceText?: string) {
  if (!confirmed && action.safety !== "auto_apply") return;

  if (action.type === "create_task") {
    const payload = action.payload as Omit<Task, "id">;
    linkPendingProject(state, action, payload);
    const existing = state.tasks.find(
      (task) =>
        task.title.toLowerCase() === payload.title.toLowerCase() &&
        (task.projectId ?? null) === (payload.projectId ?? null) &&
        task.status !== "archived"
    );
    if (existing) {
      if (shouldUpdateExistingTaskFromCreate(sourceText) && applyTaskSchedulePatch(state, existing, action.payload)) {
        action.status = "applied";
        action.appliedEntityId = existing.id;
        action.skippedReason = "Updated existing task instead of duplicating it.";
        return;
      }
      action.status = "applied";
      action.appliedEntityId = existing.id;
      action.skippedReason = "Task already exists.";
      return;
    }
    const task = {
      id: nextId("task"),
      ...payload
    };
    state.tasks.push(task);
    action.status = "applied";
    action.appliedEntityId = task.id;
    action.skippedReason = undefined;
    return;
  }

  if (action.type === "schedule_task") {
    const task = findTaskForAction(state, action);
    if (!task) {
      action.status = "failed";
      action.skippedReason = "Could not find the task to schedule.";
      return;
    }
    applyTaskSchedulePatch(state, task, action.payload);
    action.status = "applied";
    action.appliedEntityId = task.id;
    action.skippedReason = undefined;
    return;
  }

  if (action.type === "update_task") {
    const task = findTaskForAction(state, action);
    if (!task) {
      action.status = "failed";
      action.skippedReason = "Could not find the task to update.";
      return;
    }
    const payload = action.payload as { priority?: number; importance?: number; urgency?: number; dateIntent?: string; scheduledDate?: string; dueDate?: string };
    if (typeof payload.priority === "number") task.priority = clampTaskScore(payload.priority);
    if (typeof payload.importance === "number") task.importance = clampTaskScore(payload.importance);
    if (typeof payload.urgency === "number") task.urgency = clampTaskScore(payload.urgency);
    applyTaskDateIntent(state, task, payload.dateIntent, payload.scheduledDate, payload.dueDate);
    action.status = "applied";
    action.appliedEntityId = task.id;
    action.skippedReason = undefined;
    return;
  }

  if (action.type === "archive_task") {
    const task = findTaskForAction(state, action);
    if (!task) {
      action.status = "failed";
      action.skippedReason = "Could not find the task to archive.";
      return;
    }
    task.status = "archived";
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    action.status = "applied";
    action.appliedEntityId = task.id;
    action.skippedReason = undefined;
    return;
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
      action.skippedReason = undefined;
    } else {
      action.skippedReason = "Routine already exists.";
    }
    action.status = "applied";
    return;
  }

  if (action.type === "create_project") {
    const project = {
      id: nextId("project"),
      ...(action.payload as Omit<AppState["projects"][number], "id">)
    };
    state.projects.push(project);
    action.status = "applied";
    action.appliedEntityId = project.id;
    action.skippedReason = undefined;
    return;
  }

  action.skippedReason = confirmed ? "This action type is not implemented yet." : "Needs confirmation before applying.";
}

function buildCaptureSession(state: AppState, input: string, entry: AppState["inbox"][number]): CaptureSession {
  const now = timestampForState(state);
  return {
    id: nextId("capture"),
    status: "open",
    source: "inbox",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: entry.id,
        role: "user",
        content: input,
        createdAt: now
      }
    ],
    questions: [],
    actionIds: [],
    draftActionIds: [],
    appliedEntityIds: [],
    answeredFields: [],
    revisionEvents: [],
    unresolvedFields: [],
    summary: entry.summary
  };
}

function buildClarificationQuestion(state: AppState, action: AiAction): ClarificationQuestion {
  const payload = action.payload as {
    question?: string;
    questionKind?: ClarificationKind;
    options?: string[];
    materiality?: "low" | "medium" | "high";
    rationale?: string;
  };
  return {
    id: nextId("question"),
    actionId: action.id,
    question: payload.question ?? "What should this become?",
    kind: payload.questionKind ?? "next_action",
    mode: "blocking",
    status: "pending",
    options: payload.options,
    materiality: payload.materiality,
    rationale: payload.rationale,
    createdAt: timestampForState(state)
  };
}

function buildActionFromClarification(
  state: AppState,
  session: CaptureSession,
  clarificationAction: AiAction,
  question: ClarificationQuestion,
  answer: string
): AiAction {
  const payload = clarificationAction.payload as {
    draftAction?: Omit<Task, "id">;
    draftActionType?: AiAction["type"];
  };
  const draftTask = patchDraftTask(payload.draftAction, question.kind, answer);
  return {
    id: nextId("action"),
    type: payload.draftActionType ?? "create_task",
    label: `Apply answer: ${draftTask.title}`,
    payload: draftTask,
    safety: "auto_apply",
    status: "proposed",
    validationErrors: [],
    model: clarificationAction.model,
    createdAt: timestampForState(state),
    captureSessionId: session.id,
    sourceMessageId: clarificationAction.sourceMessageId,
    pendingQuestionId: question.id
  };
}

function patchDraftTask(draft: Omit<Task, "id"> | undefined, kind: ClarificationKind, answer: string): Omit<Task, "id"> {
  const task = structuredClone(draft ?? fallbackClarifiedTask(answer));
  if (kind === "definition_of_done") {
    task.definitionOfDone = answer;
    task.completionMode = task.completionMode ?? "progress_accumulating";
    task.notes = [task.notes, `Clarified done: ${answer}`].filter(Boolean).join("\n");
  }
  if (kind === "completion_behavior") {
    if (/reusable|suggestion|again|keep/i.test(answer)) {
      task.completionBehavior = "keep_as_suggestion";
      task.completionMode = "suggestion_used";
      task.type = "soft_invitation";
      task.strictness = "flexible";
      task.plannerFields.pressureLevel = "soft";
    } else if (/one.?off|once|task/i.test(answer)) {
      task.completionBehavior = "exhaust_once";
      task.completionMode = "simple_done";
      task.type = task.projectId ? "project_task" : "atomic";
    }
    task.notes = [task.notes, `Clarified behavior: ${answer}`].filter(Boolean).join("\n");
  }
  if (kind === "next_action") {
    task.title = answer;
    task.definitionOfDone = undefined;
    task.notes = [task.notes, "Created from clarified next action."].filter(Boolean).join("\n");
  }
  return task;
}

function fallbackClarifiedTask(answer: string): Omit<Task, "id"> {
  return {
    title: answer,
    type: "atomic",
    domainId: "domain_work",
    status: "active",
    repeatPolicy: { type: "none" },
    completionBehavior: "exhaust_once",
    completionMode: "simple_done",
    plannerFields: { intentType: "obligation", pressureLevel: "someday" },
    priority: 3,
    importance: 3,
    urgency: 3,
    effortMinutes: 15,
    energy: "medium",
    strictness: "normal"
  };
}

function appendActionToInboxEntry(state: AppState, inboxItemId: string | undefined, action: AiAction) {
  const entry = state.inbox.find((candidate) => candidate.id === inboxItemId);
  if (entry) {
    entry.actions.push(action);
  }
}

function addAssistantSessionMessage(state: AppState, session: CaptureSession, content: string) {
  session.messages.push({
    id: nextId("message"),
    role: "assistant",
    content,
    createdAt: timestampForState(state)
  });
}

function recordAppliedEntity(session: CaptureSession, action: AiAction) {
  if (action.appliedEntityId) pushUnique(session.appliedEntityIds, action.appliedEntityId);
}

function recordRevisionEvent(
  state: AppState,
  session: CaptureSession,
  event: Omit<NonNullable<CaptureSession["revisionEvents"]>[number], "id" | "createdAt">
) {
  session.revisionEvents.push({
    id: nextId("revision"),
    createdAt: timestampForState(state),
    ...event
  });
}

function taskSnapshotById(state: AppState, taskId: string | undefined): Partial<Task> | undefined {
  if (!taskId) return undefined;
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  return task ? taskSnapshot(task) : undefined;
}

function taskSnapshot(task: Task): Partial<Task> {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    domainId: task.domainId,
    projectId: task.projectId,
    status: task.status,
    completionBehavior: task.completionBehavior,
    completionMode: task.completionMode,
    definitionOfDone: task.definitionOfDone,
    plannerFields: structuredClone(task.plannerFields),
    priority: task.priority,
    importance: task.importance,
    urgency: task.urgency,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    scheduledTime: task.scheduledTime,
    dateIntent: task.dateIntent ? structuredClone(task.dateIntent) : undefined,
    effortMinutes: task.effortMinutes,
    notes: task.notes
  };
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function looksLikeRevision(message: string): boolean {
  return /\b(actually|instead|make it|move it|put (it|that)|under|project|category|next week|this week|tomorrow|today|not)\b/i.test(message);
}

function findSessionTaskTarget(state: AppState, session: CaptureSession): { task: Task; action?: AiAction } | undefined {
  for (const actionId of [...session.actionIds].reverse()) {
    const action = findAction(state, actionId);
    if (!action || action.type === "ask_clarification") continue;
    if (action.appliedEntityId) {
      const task = state.tasks.find((candidate) => candidate.id === action.appliedEntityId);
      if (task) return { task, action };
    }
    if (action.type === "create_task") {
      const title = String(action.payload.title ?? "");
      const task = state.tasks.find((candidate) => candidate.title.toLowerCase() === title.toLowerCase());
      if (task) return { task, action };
    }
  }
  return undefined;
}

function applyFollowUpToTask(state: AppState, task: Task, message: string): string[] {
  const changes: string[] = [];
  const lower = message.toLowerCase();

  if (/\bnext week\b/.test(lower)) {
    const range = nextWeekRange(state.currentDate);
    task.scheduledDate = undefined;
    task.dueDate = undefined;
    task.dateIntent = { kind: "week_window", originalText: message, ...range, confidence: 0.8 };
    task.plannerFields.pressureLevel = "soft";
    changes.push("moved to next week");
  } else if (/\bthis week\b/.test(lower)) {
    const range = weekRange(state.currentDate);
    task.scheduledDate = undefined;
    task.dueDate = undefined;
    task.dateIntent = { kind: "week_window", originalText: message, ...range, confidence: 0.75 };
    task.plannerFields.pressureLevel = "soft";
    changes.push("kept in this week");
  } else if (/\btomorrow\b/.test(lower)) {
    const scheduledDate = addDays(state.currentDate, 1);
    task.scheduledDate = scheduledDate;
    task.dueDate = undefined;
    task.dateIntent = { kind: "tomorrow", originalText: message, scheduledDate, confidence: 0.85 };
    task.plannerFields.pressureLevel = "scheduled";
    changes.push("scheduled for tomorrow");
  } else if (/\b(today|tonight)\b/.test(lower)) {
    task.scheduledDate = state.currentDate;
    task.dueDate = undefined;
    task.dateIntent = { kind: "today", originalText: message, scheduledDate: state.currentDate, confidence: 0.85 };
    task.plannerFields.pressureLevel = "scheduled";
    changes.push("scheduled for today");
  }

  const project = findProjectMention(state, message);
  if (project) {
    task.projectId = project.id;
    task.domainId = project.domainId;
    task.type = task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "project_task";
    task.plannerFields.intentType = project.kind === "person" ? "relationship" : "progress";
    changes.push(`moved under ${project.name}`);
  }

  if (!changes.length) {
    task.notes = [task.notes, `Follow-up: ${message}`].filter(Boolean).join("\n");
  }

  return changes;
}

function applyRevisionToTask(state: AppState, task: Task, revision: CaptureRevision, message: string): string[] {
  if (!revision.shouldApply || revision.confidence < 0.4) {
    task.notes = [task.notes, revision.note || revision.summary].filter(Boolean).join("\n");
    return [];
  }

  const changes: string[] = [];
  if (shouldApplyRevisionTitle(task, revision, message)) {
    task.title = revision.title.trim();
    changes.push("renamed");
  }

  const project = revision.projectName ? findProjectMention(state, revision.projectName) : undefined;
  if (project) {
    task.projectId = project.id;
    task.domainId = project.domainId;
    task.type = task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "project_task";
    task.plannerFields.intentType = project.kind === "person" ? "relationship" : "progress";
    changes.push(`moved under ${project.name}`);
  }

  const domain = revision.domainName ? findDomainMention(state, revision.domainName) : undefined;
  if (domain && !project) {
    task.domainId = domain.id;
    changes.push(`moved to ${domain.name}`);
  }

  const dateChange = applyRevisionDate(state, task, revision);
  if (dateChange) changes.push(dateChange);

  const timeChange = applyRevisionTime(state, task, revision);
  if (timeChange) changes.push(timeChange);

  if (revision.effortMinutes && revision.effortMinutes !== task.effortMinutes) {
    task.effortMinutes = revision.effortMinutes;
    task.estimateConfidence = Math.max(task.estimateConfidence ?? 0.5, revision.confidence);
    changes.push(`set estimate to ${revision.effortMinutes}m`);
  }

  if (revision.priority) task.priority = revision.priority;
  if (revision.importance) task.importance = revision.importance;
  if (revision.urgency) task.urgency = revision.urgency;
  if (revision.priority || revision.importance || revision.urgency) changes.push("updated priority");

  if (revision.definitionOfDone?.trim()) {
    task.definitionOfDone = revision.definitionOfDone.trim();
    task.completionMode = task.completionMode === "simple_done" ? "outcome_done" : task.completionMode;
    changes.push("updated done-state");
  }

  if (revision.completionBehavior) task.completionBehavior = revision.completionBehavior;
  if (revision.completionMode) task.completionMode = revision.completionMode;
  if (revision.completionBehavior || revision.completionMode) changes.push("updated completion behavior");

  if (revision.note?.trim()) {
    task.notes = [task.notes, `Follow-up: ${revision.note.trim()}`].filter(Boolean).join("\n");
    changes.push("added note");
  }

  return uniqueChanges(changes.length ? changes : revision.changes);
}

function shouldUpdateExistingTaskFromCreate(sourceText: string | undefined): boolean {
  return Boolean(sourceText && /\b(actually|instead|move|reschedule|change|correct|make it|put it|should be|at)\b/i.test(sourceText));
}

function findTaskForAction(state: AppState, action: AiAction): Task | undefined {
  const taskId = typeof action.payload.taskId === "string" ? action.payload.taskId : undefined;
  if (taskId) return state.tasks.find((task) => task.id === taskId && task.status !== "archived");
  const title = typeof action.payload.title === "string" ? action.payload.title.toLowerCase() : "";
  return state.tasks.find((task) => task.status !== "archived" && task.title.toLowerCase() === title);
}

function applyTaskSchedulePatch(state: AppState, task: Task, payload: Record<string, unknown>): boolean {
  let changed = false;
  const scheduledDate = typeof payload.scheduledDate === "string" && validDate(payload.scheduledDate) ? payload.scheduledDate : undefined;
  const scheduledTime = typeof payload.scheduledTime === "string" && validTime(payload.scheduledTime) ? payload.scheduledTime : undefined;
  const dueDate = typeof payload.dueDate === "string" && validDate(payload.dueDate) ? payload.dueDate : undefined;

  if (scheduledDate) {
    task.scheduledDate = scheduledDate;
    task.dueDate = undefined;
    task.dateIntent = {
      kind: scheduledDate === state.currentDate ? "today" : scheduledDate === addDays(state.currentDate, 1) ? "tomorrow" : "specific_date",
      scheduledDate,
      confidence: 0.85
    };
    task.plannerFields.pressureLevel = "scheduled";
    changed = true;
  }

  if (scheduledTime) {
    task.scheduledDate ??= state.currentDate;
    task.scheduledTime = scheduledTime;
    task.dueDate = undefined;
    task.dateIntent = {
      kind: task.scheduledDate === state.currentDate ? "today" : task.scheduledDate === addDays(state.currentDate, 1) ? "tomorrow" : "specific_date",
      scheduledDate: task.scheduledDate,
      confidence: 0.85
    };
    task.plannerFields.pressureLevel = "scheduled";
    changed = true;
  }

  if (dueDate) {
    task.dueDate = dueDate;
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dateIntent = { kind: "deadline", dueDate, confidence: 0.8 };
    task.plannerFields.pressureLevel = "due";
    changed = true;
  }

  return changed;
}

function shouldApplyRevisionTitle(task: Task, revision: CaptureRevision, message: string): revision is CaptureRevision & { title: string } {
  const title = revision.title?.trim();
  if (!title || title === task.title) return false;
  if (!/\b(rename|retitle|call it|called|name it|named|change (the )?title)\b/i.test(message)) return false;
  if (title.length < 3 || !/[A-Za-z0-9]/.test(title) || /[{}/*\\<>]/.test(title)) return false;
  return true;
}

function applyRevisionDate(state: AppState, task: Task, revision: CaptureRevision): string | undefined {
  if (!revision.dateIntent || revision.dateIntent === "unchanged") return undefined;

  if (revision.dateIntent === "next_week") {
    const range = nextWeekRange(state.currentDate);
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dueDate = undefined;
    task.dateIntent = { kind: "week_window", originalText: revision.summary, ...range, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "soft";
    return "moved to next week";
  }

  if (revision.dateIntent === "this_week") {
    const range = weekRange(state.currentDate);
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dueDate = undefined;
    task.dateIntent = { kind: "week_window", originalText: revision.summary, ...range, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "soft";
    return "kept in this week";
  }

  if (revision.dateIntent === "tomorrow") {
    const scheduledDate = validDateOr(revision.scheduledDate, addDays(state.currentDate, 1));
    task.scheduledDate = scheduledDate;
    task.dueDate = undefined;
    task.dateIntent = { kind: "tomorrow", originalText: revision.summary, scheduledDate, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "scheduled";
    return "scheduled for tomorrow";
  }

  if (revision.dateIntent === "today") {
    const scheduledDate = validDateOr(revision.scheduledDate, state.currentDate);
    task.scheduledDate = scheduledDate;
    task.dueDate = undefined;
    task.dateIntent = { kind: "today", originalText: revision.summary, scheduledDate, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "scheduled";
    return "scheduled for today";
  }

  if (revision.dateIntent === "someday") {
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dueDate = undefined;
    task.dateIntent = { kind: "someday", originalText: revision.summary, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "someday";
    return "moved to someday";
  }

  if (revision.dateIntent === "specific_date" && validDate(revision.scheduledDate)) {
    task.scheduledDate = revision.scheduledDate;
    task.dueDate = undefined;
    task.dateIntent = { kind: "specific_date", originalText: revision.summary, scheduledDate: revision.scheduledDate, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "scheduled";
    return `scheduled for ${revision.scheduledDate}`;
  }

  if (revision.dateIntent === "deadline" && validDate(revision.dueDate)) {
    task.dueDate = revision.dueDate;
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dateIntent = { kind: "deadline", originalText: revision.summary, dueDate: revision.dueDate, confidence: revision.confidence };
    task.plannerFields.pressureLevel = "due";
    return `deadline set to ${revision.dueDate}`;
  }

  return undefined;
}

function applyRevisionTime(state: AppState, task: Task, revision: CaptureRevision): string | undefined {
  if (!validTime(revision.scheduledTime)) return undefined;
  task.scheduledDate ??= validDate(revision.scheduledDate) ? revision.scheduledDate : state.currentDate;
  task.scheduledTime = revision.scheduledTime;
  task.dueDate = undefined;
  task.dateIntent = {
    kind: task.scheduledDate === state.currentDate ? "today" : task.scheduledDate === addDays(state.currentDate, 1) ? "tomorrow" : "specific_date",
    originalText: revision.summary,
    scheduledDate: task.scheduledDate,
    confidence: revision.confidence
  };
  task.plannerFields.pressureLevel = "scheduled";
  return `scheduled for ${revision.scheduledTime}`;
}

function findProjectMention(state: AppState, message: string): AppState["projects"][number] | undefined {
  const lower = message.toLowerCase();
  return state.projects.find((project) => lower.includes(project.name.toLowerCase()));
}

function findDomainMention(state: AppState, message: string): AppState["domains"][number] | undefined {
  const lower = message.toLowerCase();
  return state.domains.find((domain) => lower.includes(domain.name.toLowerCase()));
}

function uniqueChanges(changes: string[]): string[] {
  return changes.filter((change, index, all) => all.indexOf(change) === index);
}

function validDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function validTime(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

function validDateOr(value: string | null | undefined, fallback: string): string {
  return validDate(value) ? value : fallback;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown, fallback: string | undefined): string | undefined {
  if (value === undefined) return fallback;
  const trimmed = cleanText(value);
  return trimmed || undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function uniqueStateId(state: AppState, prefix: "domain" | "project" | "task" | "routine"): string {
  const pools = {
    domain: state.domains,
    project: state.projects,
    task: state.tasks,
    routine: state.routines
  };
  const ids = pools[prefix].map((entry) => entry.id);
  let index = ids.reduce((max, id) => {
    const match = id.match(new RegExp(`^${prefix}_(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  let next: string;
  do {
    index += 1;
    next = `${prefix}_${index.toString().padStart(4, "0")}`;
  } while (ids.includes(next));
  return next;
}

function validDomainId(state: AppState, value: unknown): string | undefined {
  return typeof value === "string" && state.domains.some((domain) => domain.id === value) ? value : undefined;
}

function validProjectId(state: AppState, value: unknown): string | undefined {
  return typeof value === "string" && state.projects.some((project) => project.id === value && project.status === "active") ? value : undefined;
}

function isSelectableProjectTask(state: AppState, projectId: string, taskId: string): boolean {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || task.projectId !== projectId || task.status === "archived") return false;
  if (task.status === "blocked" && !task.blocked?.unblockAction) return false;
  if (task.status === "waiting" && !task.waiting?.followUpDate) return false;
  return true;
}

function validProjectKind(value: unknown): AppState["projects"][number]["kind"] | undefined {
  return value === "project" || value === "area" || value === "person" || value === "list" || value === "idea_pool" || value === "maintenance" ? value : undefined;
}

function validPlanningMode(value: unknown): AppState["projects"][number]["planningMode"] | undefined {
  return value === "deadline_driven" || value === "maintenance" || value === "suggestion_pool" || value === "relationship" || value === "open_backlog"
    ? value
    : undefined;
}

function validProjectStatus(value: unknown): AppState["projects"][number]["status"] | undefined {
  return value === "active" || value === "paused" || value === "completed" ? value : undefined;
}

function validTaskType(value: unknown): Task["type"] | undefined {
  return value === "atomic" || value === "project_task" || value === "routine_instance" || value === "soft_invitation" ? value : undefined;
}

function validTaskStatus(value: unknown): Task["status"] | undefined {
  return value === "active" ||
    value === "scheduled" ||
    value === "completed" ||
    value === "deferred" ||
    value === "blocked" ||
    value === "waiting" ||
    value === "archived"
    ? value
    : undefined;
}

function validCompletionBehavior(value: unknown): Task["completionBehavior"] | undefined {
  return value === "exhaust_once" || value === "repeatable" || value === "keep_as_suggestion" || value === "regenerate_after_completion" ? value : undefined;
}

function validCompletionMode(value: unknown): Task["completionMode"] | undefined {
  return value === "simple_done" ||
    value === "outcome_done" ||
    value === "timebox" ||
    value === "repeatable_checkoff" ||
    value === "progress_accumulating" ||
    value === "suggestion_used"
    ? value
    : undefined;
}

function validEnergy(value: unknown): Task["energy"] | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function validStrictness(value: unknown): Task["strictness"] | undefined {
  return value === "flexible" || value === "normal" || value === "strict" ? value : undefined;
}

function validPreferredWindow(value: unknown): AppState["routines"][number]["preferredWindow"] | undefined {
  return value === "morning" || value === "afternoon" || value === "evening" ? value : undefined;
}

function normalizeRepeatPolicy(value: Task["repeatPolicy"] | undefined): Task["repeatPolicy"] {
  if (!value || value.type === "none") return { type: "none" };
  if (value.type === "daily" || value.type === "weekly") {
    return {
      type: value.type,
      days: value.days,
      preferredWindow: value.preferredWindow,
      carryover: value.carryover ?? "skip",
      cooldownDays: value.cooldownDays
    };
  }
  return { type: "none" };
}

function normalizeRoutineRecurrence(value: AppState["routines"][number]["recurrence"] | undefined): AppState["routines"][number]["recurrence"] {
  if (!value || value.type === "daily") return { type: "daily" };
  return {
    type: "weekly",
    days: Array.isArray(value.days) && value.days.length ? value.days.map((day) => clampNumber(day, 0, 6, 1)) : [1]
  };
}

function taskActionPatch(task: Task): Record<string, unknown> {
  return {
    projectId: task.projectId,
    domainId: task.domainId,
    scheduledDate: task.scheduledDate,
    dueDate: task.dueDate,
    dateIntent: task.dateIntent,
    plannerFields: task.plannerFields,
    notes: task.notes,
    type: task.type
  };
}

function timestampForState(state: AppState): string {
  return new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
}

function buildDailyReviewSummary(state: AppState, date = state.currentDate): DailyReviewSummary {
  const events = state.executionEvents.filter((event) => event.date === date);
  const completions = state.completions.filter((event) => event.date === date);
  const completedPlanIds = new Set(
    [...events.filter((event) => event.type === "completed").map((event) => event.planItemId), ...completions.map((event) => event.planItemId)].filter(
      (planItemId): planItemId is string => Boolean(planItemId)
    )
  );
  const partialEvents = events.filter((event) => event.type === "worked_on" || event.type === "partially_completed");
  const deferredEvents = events.filter((event) => event.type === "deferred");
  const blockedEvents = events.filter((event) => event.type === "blocked" || event.type === "waiting_on");
  const skippedEvents = events.filter((event) => ["skipped", "canceled", "marked_not_important"].includes(event.type));
  const deferrals = state.deferrals.filter((event) => event.date === date);
  const deferredPlanIds = new Set(
    [...deferredEvents.map((event) => event.planItemId), ...deferrals.map((event) => event.planItemId)].filter((planItemId): planItemId is string =>
      Boolean(planItemId)
    )
  );

  const completedTitles = [...completedPlanIds].map((planItemId) => planTitleFromId(state, date, planItemId));
  const partialTitles = partialEvents.map((event) => eventTitle(state, date, event));
  const deferredTitles = [...deferredPlanIds].map((planItemId) => planTitleFromId(state, date, planItemId));
  const blockedTitles = blockedEvents.map((event) => eventTitle(state, date, event));
  const skippedTitles = skippedEvents.map((event) => eventTitle(state, date, event));

  return {
    date,
    completedCount: completedPlanIds.size,
    partialCount: partialEvents.length,
    deferredCount: deferredPlanIds.size,
    blockedCount: blockedEvents.length,
    skippedCount: skippedEvents.length,
    completedTitles,
    partialTitles,
    deferredTitles,
    blockedTitles,
    skippedTitles,
    calibrationSignals: summaryCalibrationSignals(deferrals, events),
    existingReview: state.dailyReviews.find((review) => review.date === date)
  };
}

function summaryCalibrationSignals(deferrals: AppState["deferrals"], events: ExecutionEvent[]): string[] {
  const signals: string[] = [];
  const overloadCount = deferrals.filter((entry) => ["no_time", "overplanned"].includes(entry.reason)).length;
  const lowEnergyCount = deferrals.filter((entry) => entry.reason === "low_energy").length;
  const vagueCount = events.filter((event) => event.reason === "too_vague").length;
  const blockedCount = events.filter((event) => event.type === "blocked" || event.type === "waiting_on").length;
  if (overloadCount) signals.push(`${overloadCount} time/load deferral${overloadCount === 1 ? "" : "s"}`);
  if (lowEnergyCount) signals.push(`${lowEnergyCount} low-energy deferral${lowEnergyCount === 1 ? "" : "s"}`);
  if (vagueCount) signals.push(`${vagueCount} vague item${vagueCount === 1 ? "" : "s"} need sharper next actions`);
  if (blockedCount) signals.push(`${blockedCount} blocked/waiting item${blockedCount === 1 ? "" : "s"} should be pruned or converted to unblock actions`);
  return signals;
}

function reviewCalibrationSignals(energy: DailyReviewEnergy, planFit: DailyReviewPlanFit, summary: DailyReviewSummary): string[] {
  const signals = [...summary.calibrationSignals];
  if (planFit === "overplanned") signals.push("review marked the day as overplanned");
  if (planFit === "underfilled") signals.push("review marked the day as underfilled");
  if (energy === "low") signals.push("review marked low energy");
  return signals.filter((signal, index, all) => all.indexOf(signal) === index);
}

function dailyReviewCapacityAdjustment(energy: DailyReviewEnergy, planFit: DailyReviewPlanFit, summary: DailyReviewSummary): number {
  let adjustment = 0;
  if (planFit === "overplanned") adjustment -= 45;
  if (planFit === "underfilled") adjustment += 15;
  if (energy === "low") adjustment -= 30;
  if (energy === "high" && planFit === "realistic") adjustment += 10;
  if (summary.deferredCount >= 3) adjustment -= 20;
  if (summary.partialCount >= 2) adjustment -= 10;
  return Math.max(-90, Math.min(25, adjustment));
}

function eventTitle(state: AppState, date: string, event: ExecutionEvent): string {
  if (event.taskId) return state.tasks.find((task) => task.id === event.taskId)?.title ?? event.taskId;
  if (event.taskIds?.[0]) return state.tasks.find((task) => task.id === event.taskIds?.[0])?.title ?? event.taskIds[0];
  return event.planItemId ? planTitleFromId(state, date, event.planItemId) : "Untitled item";
}

function planTitleFromId(state: AppState, date: string, planItemId: string): string {
  const prefix = `plan_${date}_`;
  const entityId = planItemId.startsWith(prefix) ? planItemId.slice(prefix.length).replace(/_phase_\d+$/, "") : planItemId;
  return (
    state.tasks.find((task) => task.id === entityId)?.title ??
    state.projects.find((project) => project.id === entityId)?.name ??
    state.routines.find((routine) => routine.id === entityId)?.title ??
    planItemId
  );
}

function taskIdsCompletedByPlanItem(item: ReturnType<typeof buildDayPlan>["items"][number], requestedTaskIds?: string[]) {
  if (requestedTaskIds?.length) return requestedTaskIds;
  if (item.taskId) return [item.taskId];
  return item.selectedTaskIds ?? [];
}

function markTasksCompleted(state: AppState, taskIds: string[]) {
  const completedAt = new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
  for (const task of state.tasks) {
    if (taskIds.includes(task.id)) {
      if (task.completionBehavior === "exhaust_once") {
        task.status = "completed";
      } else {
        task.status = "active";
      }
      task.completedAt = completedAt;
      task.lastCompletedAt = completedAt;
    }
  }
}

function applyOutcomeToTask(
  task: Task,
  input: {
    type: ExecutionEventType;
    reason?: ExecutionEvent["reason"];
    note?: string;
    nextAction?: string;
    blocked?: BlockedMetadata;
    waiting?: WaitingMetadata;
  }
) {
  if (input.type === "blocked") {
    task.status = "blocked";
    task.blocked = input.blocked ?? { blockedBy: "missing_info", note: input.note };
    task.blockedReason = input.note ?? input.blocked?.note;
  }
  if (input.type === "waiting_on") {
    task.status = "waiting";
    task.waiting = input.waiting ?? { waitingOn: input.note ?? "someone" };
  }
  if (input.type === "marked_not_important") {
    task.priority = Math.max(1, task.priority - 2);
    task.urgency = Math.max(1, task.urgency - 2);
  }
  if (input.type === "canceled") {
    task.status = "archived";
  }
  if (input.type === "worked_on" || input.type === "partially_completed") {
    task.status = "active";
    if (input.nextAction) {
      task.notes = [task.notes, `Next action: ${input.nextAction}`].filter(Boolean).join("\n");
    }
  }
}

function addExecutionEvent(
  state: AppState,
  input: Omit<ExecutionEvent, "id" | "date" | "createdAt">
) {
  state.executionEvents.push({
    id: nextId("event"),
    date: state.currentDate,
    createdAt: new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString(),
    ...input
  });
}

function normalizeDeferralReason(reason: ExecutionEvent["reason"]): DeferralReason {
  if (
    reason === "no_time" ||
    reason === "low_energy" ||
    reason === "blocked" ||
    reason === "too_vague" ||
    reason === "overplanned" ||
    reason === "avoidance" ||
    reason === "not_important" ||
    reason === "moved_intentionally" ||
    reason === "other"
  ) {
    return reason;
  }
  return "other";
}

function restoreTasksForUndoneCompletion(state: AppState, taskIds: string[]) {
  const stillCompleted = new Set(
    state.completions.flatMap((event) => (event.taskIds ?? []).filter((taskId) => taskIds.includes(taskId)))
  );
  for (const task of state.tasks) {
    if (taskIds.includes(task.id) && !stillCompleted.has(task.id)) {
      task.status = "active";
      task.completedAt = undefined;
      task.lastCompletedAt = undefined;
    }
  }
}

function removeTaskCompletion(state: AppState, planItemId: string, taskId: string): boolean {
  let removed = false;
  state.completions = state.completions.flatMap((event) => {
    if (event.date !== state.currentDate || event.planItemId !== planItemId || !event.taskIds?.includes(taskId)) return [event];
    removed = true;
    const remainingTaskIds = event.taskIds.filter((candidate) => candidate !== taskId);
    return remainingTaskIds.length ? [{ ...event, taskIds: remainingTaskIds }] : [];
  });
  if (removed) {
    state.executionEvents = state.executionEvents.filter(
      (event) =>
        !(
          event.date === state.currentDate &&
          event.planItemId === planItemId &&
          event.type === "completed" &&
          event.taskIds?.includes(taskId)
        )
    );
  }
  return removed;
}

function archiveDuplicateTasksForFollowUp(state: AppState, target: Task, message: string): Task[] {
  if (!/\b(duplicate|duplicates|same thing|only be one|just one|old|original|older|get rid of|remove|delete|archive)\b/i.test(message)) return [];
  const duplicateCandidates = state.tasks.filter((task) => task.id !== target.id && task.status !== "archived" && tasksLookRelated(task, target, message));
  if (!duplicateCandidates.length) return [];
  for (const task of duplicateCandidates) {
    task.status = "archived";
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
  }
  return duplicateCandidates;
}

function tasksLookRelated(candidate: Task, target: Task, message: string): boolean {
  const messageTokens = new Set(tokensForMatch(message));
  const targetTokens = new Set(tokensForMatch(target.title));
  const candidateTokens = tokensForMatch(candidate.title);
  return candidateTokens.some((token) => targetTokens.has(token) || messageTokens.has(token));
}

function tokensForMatch(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2 && !["the", "and", "with", "task"].includes(token));
}

function findAction(state: AppState, actionId: string): AiAction | undefined {
  for (const entry of state.inbox) {
    const action = entry.actions.find((candidate) => candidate.id === actionId);
    if (action) return action;
  }
  return undefined;
}
