import { interpretInboxInput, type AiInterpreter } from "./ai-actions";
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
  DeferralReason,
  ExecutionEvent,
  ExecutionEventType,
  Task,
  WaitingMetadata
} from "./types";

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

export function completePlanItem(planItemId: string, actualMinutes?: number, completedTaskIds?: string[]): AppState {
  const state = currentState();
  const plan = buildDayPlan(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

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
  const state = currentState();
  const entry = await interpretInboxInput(input, state, interpreter);
  const session = buildCaptureSession(state, input, entry);
  entry.captureSessionId = session.id;
  for (const action of entry.actions) {
    action.captureSessionId = session.id;
    action.sourceMessageId = entry.id;
    if (action.type === "ask_clarification") {
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

  for (const action of entry.actions) {
    applyAutoAction(state, action);
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

  question.status = "answered";
  question.answer = answer;
  question.answeredAt = timestampForState(state);
  const draftAction = buildActionFromClarification(state, session, action, question, answer);
  action.status = "applied";
  action.skippedReason = `Answered: ${answer}`;
  appendActionToInboxEntry(state, action.sourceMessageId, draftAction);
  session.actionIds.push(draftAction.id);
  session.messages.push({
    id: nextId("message"),
    role: "user",
    content: answer,
    createdAt: timestampForState(state)
  });
  session.unresolvedFields = session.unresolvedFields.filter((field) => field !== question.kind);
  applyAutoAction(state, draftAction);
  session.status = session.questions.some((candidate) => candidate.status === "pending") ? "waiting_for_user" : "applied";
  session.updatedAt = timestampForState(state);
  return getState();
}

export function addCaptureSessionMessage(sessionId: string, message: string): AppState {
  const state = currentState();
  const session = state.captureSessions.find((candidate) => candidate.id === sessionId);
  const trimmed = message.trim();
  if (!session || !trimmed || session.status === "dismissed") return getState();

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
      session.unresolvedFields = session.unresolvedFields.filter((field) => field !== pendingQuestion.kind);
      applyAutoAction(state, draftAction);
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

  const changes = applyFollowUpToTask(state, target.task, trimmed);
  if (target.action) target.action.payload = { ...target.action.payload, ...taskActionPatch(target.task) };
  addAssistantSessionMessage(
    state,
    session,
    changes.length ? `Updated ${target.task.title}: ${changes.join(", ")}.` : `Kept that note on ${target.task.title}.`
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

function applyAutoAction(state: AppState, action: AiAction) {
  if (action.status === "failed") return;
  if (action.safety !== "auto_apply") {
    action.skippedReason = action.validationErrors?.length
      ? action.validationErrors.join(" ")
      : "Needs confirmation before applying.";
    return;
  }
  applyAction(state, action, false);
}

function applyAction(state: AppState, action: AiAction, confirmed: boolean) {
  if (!confirmed && action.safety !== "auto_apply") return;

  if (action.type === "create_task") {
    const payload = action.payload as Omit<Task, "id">;
    const existing = state.tasks.find(
      (task) =>
        task.title.toLowerCase() === payload.title.toLowerCase() &&
        (task.projectId ?? null) === (payload.projectId ?? null) &&
        task.status !== "archived"
    );
    if (existing) {
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

function findProjectMention(state: AppState, message: string): AppState["projects"][number] | undefined {
  const lower = message.toLowerCase();
  return state.projects.find((project) => lower.includes(project.name.toLowerCase()));
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

function findAction(state: AppState, actionId: string): AiAction | undefined {
  for (const entry of state.inbox) {
    const action = entry.actions.find((candidate) => candidate.id === actionId);
    if (action) return action;
  }
  return undefined;
}
