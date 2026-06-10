import fs from "node:fs";
import path from "node:path";
import { defaultOrganizerInterpreter, interpretCaptureRevision, interpretInboxInput, schedulingForMode, type AiInterpreter, type AiRevisionInterpreter, type CaptureRevision } from "./ai-actions";
import { addDays, nextWeekRange, weekRange } from "./dates";
import { buildMorningList, findDayList, renderDayList, type DayListView } from "./day-list";
import { buildCommitment, countNewCandidates, findCommitment, renderCommittedPlan, snapshotPlanItem } from "./day-view";
import { nextId } from "./ids";
import { blockFolderId, buildDayPlan, hasActiveChildren } from "./planner";
import { defaultStateFilePath, getRepository } from "./repository";
import { createRealisticCharacterState } from "./scenarios";
import type {
  AiAction,
  AppState,
  BlockedMetadata,
  CaptureSession,
  ClarificationKind,
  ClarificationQuestion,
  CommittedDayPlan,
  DayList,
  DayListSource,
  DayPlan,
  DailyReviewEnergy,
  DailyReviewPlanFit,
  DeferralReason,
  ExecutionEvent,
  ExecutionEventType,
  Folder,
  Task,
  WaitingMetadata
} from "./types";

export type StructureMutation =
  | { entity: "folder"; action: "create"; patch: Partial<Folder> }
  | { entity: "folder"; action: "update"; id: string; patch: Partial<Folder> }
  | { entity: "folder"; action: "archive"; id: string }
  | { entity: "task"; action: "create"; patch: Partial<Task> }
  | {
      entity: "task";
      action: "update";
      id: string;
      patch: Partial<Task> & {
        schedulingMode?: "exclusive" | "concurrent" | "background" | "phased";
        dateIntentKind?: "today" | "tomorrow" | "this_week" | "next_week" | "someday" | "specific_date" | "deadline" | "none";
      };
    }
  | { entity: "task"; action: "archive"; id: string };

export type BlockSelectionAction = "add" | "remove" | "regenerate";

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

// --- AI change history & undo (T061, persistence T077) --------------------------------------
// Apply model: auto-apply with undo. Before any AI operation mutates state we snapshot the
// prior state; undo restores it. History is kept OUTSIDE AppState so it never leaks into the
// model context or state serialization. When the state itself is file-persisted (the default),
// history is write-through persisted to a sibling .history.json so undo survives restarts.

interface ChangeHistoryEntry {
  id: string;
  source: string;
  summary: string;
  createdAt: string;
  snapshot: AppState;
}

const MAX_CHANGE_HISTORY = 50;
const globalHistoryStore = globalThis as typeof globalThis & { __ex3cuusionChangeHistory?: ChangeHistoryEntry[] };

// History persists only alongside file-backed state: postgres mode has its own durability story
// (not covered yet), memory mode is explicitly throwaway, and tests must stay hermetic.
function historyFilePath(): string | undefined {
  if (process.env.NODE_ENV === "test") return undefined;
  const mode = process.env.EX3CUUSION_STATE_REPOSITORY;
  if (mode === "postgres" || mode === "memory") return undefined;
  const stateFile = process.env.EX3CUUSION_STATE_FILE;
  if (stateFile) return `${stateFile}.history.json`;
  return path.join(path.dirname(defaultStateFilePath()), "history.json");
}

function changeHistory(): ChangeHistoryEntry[] {
  if (globalHistoryStore.__ex3cuusionChangeHistory === undefined) {
    globalHistoryStore.__ex3cuusionChangeHistory = loadPersistedHistory();
  }
  return globalHistoryStore.__ex3cuusionChangeHistory;
}

function loadPersistedHistory(): ChangeHistoryEntry[] {
  const file = historyFilePath();
  if (!file) return [];
  try {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as ChangeHistoryEntry[]) : [];
  } catch {
    return []; // a corrupt history file should never block the app; undo just starts fresh
  }
}

function persistHistory(): void {
  const file = historyFilePath();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(changeHistory()));
  } catch {
    // best-effort: failing to persist history must not break the mutation itself
  }
}

function clearChangeHistory(): void {
  globalHistoryStore.__ex3cuusionChangeHistory = [];
  persistHistory();
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
  persistHistory();
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
  persistHistory();
  return getState();
}

function summarizeInbox(input: string): string {
  const trimmed = input.trim();
  return `Inbox: ${trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed}`;
}

// Human-readable history/toast summary for a manual structure mutation, e.g.
// 'Updated task "Finish auth bug"' instead of the generic "Manual update task" (T078).
function describeStructureMutation(mutation: StructureMutation): string {
  const verb = mutation.action === "create" ? "Created" : mutation.action === "archive" ? "Archived" : "Updated";
  const state = currentState();
  const name =
    mutation.action === "create"
      ? cleanText((mutation.patch as { title?: string; name?: string }).title ?? (mutation.patch as { name?: string }).name)
      : mutation.entity === "task"
        ? state.tasks.find((task) => task.id === mutation.id)?.title
        : (state.folders ?? []).find((folder) => folder.id === mutation.id)?.name;
  const label = name ? ` "${name.length > 40 ? `${name.slice(0, 37)}...` : name}"` : "";
  return `${verb} ${mutation.entity}${label}`;
}

export function loadRealisticCharacterScenario(): AppState {
  replaceState(createRealisticCharacterState());
  return getState();
}

// --- Committed day plan (T090) ----------------------------------------------------------------
// The day plan is MINE, not a perpetually re-computed draft: the first view of a day snapshots
// the generated plan into state.committedPlans, and every "today" read renders that commitment
// with live status overlays (dayView). "Replan rest of day" is the only reshuffler; AI/timeline
// schedule changes replan through the same gate WITHIN their own recorded change.

function replaceCommitment(state: AppState, commitment: CommittedDayPlan): void {
  state.committedPlans = [...(state.committedPlans ?? []).filter((entry) => entry.date !== commitment.date), commitment];
}

// Explicit, undoable commit of today's generated plan. The silent auto-commit inside dayView
// passes record: false so first-view commits create no undo noise.
export function commitDayPlan(options?: { record?: boolean }): AppState {
  if (options?.record !== false) recordChange("commit", "Committed the day plan");
  const state = currentState();
  replaceCommitment(state, buildCommitment(state));
  return getState();
}

// THE single read path for today's plan. Auto-commits silently on the first view of a day, then
// renders the committed items with live overlays plus the new-candidate staleness count.
export function dayView(state: AppState = currentState()): DayPlan {
  state.committedPlans ??= [];
  let commitment = findCommitment(state, state.currentDate);
  if (!commitment) {
    commitment = buildCommitment(state);
    state.committedPlans.push(commitment);
  }
  const plan = renderCommittedPlan(state, commitment);
  plan.newCandidateCount = countNewCandidates(state, commitment);
  return plan;
}

// Regenerate the rest of the day as one undoable change: items already settled today (completed/
// deferred) keep their committed snapshot; everything else is replaced by a fresh generation.
export function replanRestOfDay(): AppState {
  recordChange("replan", "Replanned the rest of the day");
  replanWithinState(currentState());
  return getState();
}

// In-change replan (no recordChange of its own): used by replanRestOfDay and by AI/schedule
// mutations whose enclosing operation already snapshotted history.
function replanWithinState(state: AppState): void {
  const existing = findCommitment(state, state.currentDate);
  const settledIds = new Set(
    existing
      ? renderCommittedPlan(state, existing)
          .items.filter((item) => item.status === "completed" || item.status === "deferred")
          .map((item) => item.id)
      : []
  );
  const kept = existing ? existing.items.filter((item) => settledIds.has(item.id)) : [];
  const fresh = buildDayPlan(state)
    .items.filter((item) => !settledIds.has(item.id))
    .map(snapshotPlanItem);
  replaceCommitment(state, { date: state.currentDate, committedAt: timestampForState(state), items: [...kept, ...fresh] });
}

function committedTaskIdSet(commitment: CommittedDayPlan): Set<string> {
  return new Set(
    commitment.items.flatMap((item) =>
      [item.taskId, item.parentTaskId, ...(item.selectedTaskIds ?? [])].filter((id): id is string => Boolean(id))
    )
  );
}

// AI changes replan through the same gate: after a batch of actions applies, replan in-change if
// any applied action scheduled/created a task for today, scheduled a folder block for today, or
// archived/completed a task that is part of today's committed plan. No commitment -> nothing to
// keep stable yet; the first dayView will commit a fresh plan that already includes the changes.
function maybeReplanForActions(state: AppState, actions: AiAction[]): void {
  const commitment = findCommitment(state, state.currentDate);
  if (!commitment) return;
  const committedTaskIds = committedTaskIdSet(commitment);
  const affectsToday = actions.some((action) => {
    if (action.status !== "applied") return false;
    if (action.type === "schedule_block") {
      const date = typeof action.payload.date === "string" && validDate(action.payload.date) ? action.payload.date : state.currentDate;
      return date === state.currentDate;
    }
    if (!action.appliedEntityId) return false;
    if (action.type === "archive_task" || action.type === "mark_task_done") return committedTaskIds.has(action.appliedEntityId);
    if (action.type === "create_task" || action.type === "schedule_task" || action.type === "update_task") {
      const task = state.tasks.find((entry) => entry.id === action.appliedEntityId);
      return task?.scheduledDate === state.currentDate;
    }
    return false;
  });
  if (affectsToday) replanWithinState(state);
}

// Same gate for direct schedule edits (timeline drag / move dialog / manual date changes): when
// the edited task lands on today or was part of today's committed plan, replan in-change.
function maybeReplanForScheduleChange(state: AppState, task: Task): void {
  const commitment = findCommitment(state, state.currentDate);
  if (!commitment) return;
  if (task.scheduledDate === state.currentDate || committedTaskIdSet(commitment).has(task.id)) {
    replanWithinState(state);
  }
}

// --- Day list (T092) ---------------------------------------------------------------------------
// List-first Today: the day's commitment is the user's hand-authored LIST, advised (not authored)
// by the system. The first read of a day materializes the morning list silently (no history —
// mirrors the T090 auto-commit); every list change after that is an explicit, undoable mutation.
// The T090 committedPlans/dayView machinery stays intact as the (secondary) timeline view.

// THE single read-path gate: builds + stores today's list on first access. Silent, like the
// dayView auto-commit. Returns the LIVE list object inside the repository state.
export function ensureDayList(state: AppState = currentState()): DayList {
  state.dayLists ??= [];
  let list = findDayList(state, state.currentDate);
  if (!list) {
    list = buildMorningList(state, state.currentDate);
    state.dayLists.push(list);
  }
  return list;
}

// The read model for the Today surface (list + habit strip + tray + gauges).
export function dayListView(state: AppState = currentState()): DayListView {
  return renderDayList(state, ensureDayList(state));
}

function normalizeDayListOrder(list: DayList): void {
  list.entries.forEach((entry, index) => {
    entry.order = index;
  });
}

function truncateTitle(title: string): string {
  return title.length > 40 ? `${title.slice(0, 37)}...` : title;
}

// Append a task to today's list. Idempotent: re-adding an existing entry is a silent no-op (no
// history noise). Default source is "tray" (the one-tap tray add).
export function addTaskToDayList(taskId: string, options?: { source?: DayListSource }): AppState {
  const state = currentState();
  const list = ensureDayList(state);
  const task = state.tasks.find((entry) => entry.id === taskId && entry.status !== "archived");
  if (!task || list.entries.some((entry) => entry.taskId === taskId)) return getState();
  recordChange("day_list", `Added "${truncateTitle(task.title)}" to today's list`);
  list.entries.push({
    taskId,
    order: list.entries.length,
    pinnedTime: task.scheduledDate === state.currentDate && validTime(task.scheduledTime) ? task.scheduledTime : undefined,
    source: options?.source ?? "tray"
  });
  normalizeDayListOrder(list);
  return getState();
}

// Remove an entry from today's list (back to the tray). The task itself is untouched.
export function removeTaskFromDayList(taskId: string): AppState {
  const state = currentState();
  const list = ensureDayList(state);
  const entry = list.entries.find((candidate) => candidate.taskId === taskId);
  if (!entry) return getState();
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  recordChange("day_list", `Removed "${truncateTitle(task?.title ?? taskId)}" from today's list`);
  list.entries = list.entries.filter((candidate) => candidate.taskId !== taskId);
  normalizeDayListOrder(list);
  return getState();
}

// Full replacement order for today's list. Unknown/duplicate ids in the request are ignored;
// entries missing from the request keep their previous relative order at the end. A no-op
// reorder records nothing.
export function reorderDayList(orderedTaskIds: string[]): AppState {
  const state = currentState();
  const list = ensureDayList(state);
  const byTaskId = new Map(list.entries.map((entry) => [entry.taskId, entry]));
  const requested = orderedTaskIds.filter((taskId, index, all) => byTaskId.has(taskId) && all.indexOf(taskId) === index);
  const requestedSet = new Set(requested);
  const current = [...list.entries].sort((a, b) => a.order - b.order);
  const next = [...requested.map((taskId) => byTaskId.get(taskId)!), ...current.filter((entry) => !requestedSet.has(entry.taskId))];
  if (next.every((entry, index) => entry === current[index])) return getState();
  recordChange("day_list", "Reordered today's list");
  list.entries = next;
  normalizeDayListOrder(list);
  return getState();
}

// Pin (or clear, with undefined) a display time on a list entry. Pins sort/display only — the
// capacity gauge owns the "does the day fit" question. Invalid times are rejected silently.
export function setDayListPin(taskId: string, pinnedTime?: string): AppState {
  const state = currentState();
  const list = ensureDayList(state);
  const entry = list.entries.find((candidate) => candidate.taskId === taskId);
  if (!entry) return getState();
  if (pinnedTime !== undefined && !validTime(pinnedTime)) return getState();
  if (entry.pinnedTime === pinnedTime) return getState();
  const title = truncateTitle(state.tasks.find((candidate) => candidate.id === taskId)?.title ?? taskId);
  recordChange("day_list", pinnedTime ? `Pinned "${title}" at ${pinnedTime}` : `Unpinned "${title}"`);
  entry.pinnedTime = pinnedTime;
  return getState();
}

// Tick a task straight off the list/habit strip — no plan item required (tray-added tasks are
// not in the committed timeline). Mirrors completePlanItem's task branch exactly, keyed by the
// CANONICAL plan id (`plan_<date>_<taskId>`) so the timeline resolves the same tick, and toggles
// off a completion recorded today (by this path or a plan/block tick). Undoable.
export function completeTaskDirect(taskId: string, actualMinutes?: number): AppState {
  const state = currentState();
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || task.status === "archived") return getState();
  recordChange("complete", `Ticked "${truncateTitle(task.title)}"`);
  const planItemId = `plan_${state.currentDate}_${taskId}`;

  const existing = state.completions.find(
    (event) => event.date === state.currentDate && (event.planItemId === planItemId || event.taskIds?.includes(taskId))
  );
  if (existing) {
    state.completions = state.completions.flatMap((event) => {
      if (event !== existing) return [event];
      const remainingTaskIds = (event.taskIds ?? []).filter((id) => id !== taskId);
      return remainingTaskIds.length ? [{ ...event, taskIds: remainingTaskIds }] : [];
    });
    state.executionEvents = state.executionEvents.filter(
      (event) =>
        !(
          event.date === state.currentDate &&
          event.type === "completed" &&
          (event.planItemId === planItemId || event.taskIds?.includes(taskId) === true)
        )
    );
    restoreTasksForUndoneCompletion(state, [taskId]);
    rollBackCompletionTimestamps(state, taskId);
    return getState();
  }

  state.deferrals = state.deferrals.filter((event) => !(event.date === state.currentDate && event.planItemId === planItemId));
  markTasksCompleted(state, [taskId]);
  state.completions.push({
    id: nextId("completion"),
    date: state.currentDate,
    planItemId,
    taskIds: [taskId],
    actualMinutes
  });
  addExecutionEvent(state, { type: "completed", planItemId, taskIds: [taskId], actualMinutes });
  return getState();
}

// T092: after unticking TODAY's completion of a task that also completed on earlier days,
// restoreTasksForUndoneCompletion leaves it "completed" (some completion event still exists —
// from yesterday). Roll completedAt/lastCompletedAt back to the latest REMAINING completion day
// so today reads as unticked while the history (and streaks) stand. Date-granularity timestamp
// is fine: every consumer compares dates, not clock times.
function rollBackCompletionTimestamps(state: AppState, taskId: string): void {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) return;
  const latestRemaining = state.completions
    .filter((event) => event.taskIds?.includes(taskId))
    .map((event) => event.date)
    .sort()
    .pop();
  const rolledBack = latestRemaining ? new Date(`${latestRemaining}T12:00:00.000Z`).toISOString() : undefined;
  if (task.lastCompletedAt?.slice(0, 10) === state.currentDate) task.lastCompletedAt = rolledBack;
  if (task.completedAt?.slice(0, 10) === state.currentDate) task.completedAt = rolledBack;
}

// Inline instant add: create a minimal task and put it on today's list as ONE undoable change.
// AI enrichment is a SEPARATE follow-up step (enrichCapturedTask via POST /api/day-list/enrich)
// so the add itself never blocks on a model call.
export function instantCaptureToDayList(title: string): { state: AppState; taskId?: string } {
  const cleaned = cleanText(title);
  if (!cleaned) return { state: getState() };
  const state = currentState();
  ensureDayList(state); // materialize the morning list BEFORE the snapshot so undo keeps it
  recordChange("capture", `Captured "${truncateTitle(cleaned)}" to today's list`);
  const task: Task = {
    id: uniqueStateId(state, "task"),
    title: cleaned,
    type: "atomic",
    status: "active",
    repeatPolicy: { type: "none" },
    completionBehavior: "exhaust_once",
    completionMode: "simple_done",
    plannerFields: { intentType: "obligation", pressureLevel: "soft" },
    priority: 5,
    importance: 3,
    urgency: 3,
    effortMinutes: 30,
    energy: "medium",
    strictness: "normal",
    source: "manual"
  };
  state.tasks.push(task);
  const list = ensureDayList(state);
  list.entries.push({ taskId: task.id, order: list.entries.length, source: "manual" });
  normalizeDayListOrder(list);
  return { state: getState(), taskId: task.id };
}

// Async enrichment for an instant capture: interpret the raw title (folder/date/time/effort)
// through the capture-revision path — deterministic fixture in tests — and apply it to the task
// as its own undoable change. Best-effort: an interpreter failure leaves the capture as typed.
export async function enrichCapturedTask(taskId: string, interpreter?: AiRevisionInterpreter): Promise<AppState> {
  const state = currentState();
  const task = state.tasks.find((entry) => entry.id === taskId && entry.status !== "archived");
  if (!task) return getState();
  const session: CaptureSession = {
    id: nextId("capture"),
    status: "open",
    source: "inbox",
    createdAt: timestampForState(state),
    updatedAt: timestampForState(state),
    messages: [],
    questions: [],
    actionIds: [],
    draftActionIds: [],
    appliedEntityIds: [task.id],
    answeredFields: [],
    revisionEvents: [],
    unresolvedFields: [],
    summary: `Instant capture: ${task.title}`
  };
  let revision: CaptureRevision;
  try {
    revision = await interpretCaptureRevision(task.title, state, session, task, interpreter);
  } catch {
    return getState(); // enrichment is best-effort; the captured task stands as typed
  }
  recordChange("enrich", `Enriched "${truncateTitle(task.title)}"`);
  applyRevisionToTask(state, task, revision, ""); // empty message: a model-suggested rename is never applied
  // Keep the list pin in sync when enrichment scheduled the task for today at a clock time.
  const entry = findDayList(state, state.currentDate)?.entries.find((candidate) => candidate.taskId === taskId);
  if (entry && task.scheduledDate === state.currentDate && validTime(task.scheduledTime)) {
    entry.pinnedTime = task.scheduledTime;
  }
  maybeReplanForScheduleChange(state, task); // T090: the timeline stays in sync within this change
  return getState();
}

// True if `nodeId` is within the subtree rooted at `ancestorId` (walks up the parent chain).
function isDescendantOf(state: AppState, nodeId: string, ancestorId: string): boolean {
  let current = state.tasks.find((task) => task.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentTaskId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentTaskId === ancestorId) return true;
    current = state.tasks.find((task) => task.id === current!.parentTaskId);
  }
  return false;
}

// Resolve a requested parent task id for multi-level hierarchy (T071 single-level, T076 multi).
// Returns the parent id, or undefined to clear/reject. Rejects self-parenting and any choice that
// would create a cycle (parenting a task under one of its own descendants).
function resolveParentForChild(state: AppState, requested: string | undefined, selfId?: string): string | undefined {
  if (!requested) return undefined;
  if (requested === selfId) return undefined;
  const parent = state.tasks.find((task) => task.id === requested && task.status !== "archived");
  if (!parent) return undefined;
  if (selfId && isDescendantOf(state, requested, selfId)) return undefined; // would create a cycle
  return parent.id;
}

// T088: true if folder `nodeId` is within the subtree rooted at `ancestorId` (walks up the
// parentFolderId chain), used to reject folder-parenting choices that would create a cycle.
function isFolderDescendantOf(state: AppState, nodeId: string, ancestorId: string): boolean {
  const folders = state.folders ?? [];
  let current = folders.find((folder) => folder.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentFolderId === ancestorId) return true;
    current = folders.find((folder) => folder.id === current!.parentFolderId);
  }
  return false;
}

// Resolve a requested parent folder id. Returns the parent id, or undefined to clear/reject.
// Rejects self-parenting and any choice that would create a cycle (parenting a folder under one of
// its own descendants). Analogous to resolveParentForChild for tasks.
function resolveFolderParent(state: AppState, requested: string | undefined, selfId?: string): string | undefined {
  if (!requested) return undefined;
  if (requested === selfId) return undefined;
  const parent = (state.folders ?? []).find((folder) => folder.id === requested);
  if (!parent) return undefined;
  if (selfId && isFolderDescendantOf(state, requested, selfId)) return undefined; // would create a cycle
  return parent.id;
}

export function applyStructureMutation(mutation: StructureMutation): AppState {
  recordChange("manual_edit", describeStructureMutation(mutation));
  const state = currentState();

  if (mutation.entity === "folder") {
    state.folders ??= [];
    if (mutation.action === "create") {
      const id = uniqueFolderId(state);
      const parentFolderId = resolveFolderParent(state, mutation.patch.parentFolderId);
      state.folders.push({
        id,
        name: cleanText(mutation.patch.name) || "New folder",
        parentFolderId,
        weight: mutation.patch.weight === undefined ? undefined : clampNumber(mutation.patch.weight, 1, 10, 5),
        canBlock: mutation.patch.canBlock,
        defaultBlockMinutes:
          mutation.patch.defaultBlockMinutes === undefined ? undefined : clampNumber(mutation.patch.defaultBlockMinutes, 5, 480, 30),
        contextNote: optionalText(mutation.patch.contextNote, undefined),
        status: validFolderStatus(mutation.patch.status) ?? "active"
      });
      return getState();
    }

    const folder = state.folders.find((entry) => entry.id === mutation.id);
    if (!folder) return getState();
    if (mutation.action === "archive") {
      folder.status = "archived";
      return getState();
    }

    folder.name = cleanText(mutation.patch.name) || folder.name;
    if (mutation.patch.parentFolderId !== undefined) {
      folder.parentFolderId =
        mutation.patch.parentFolderId === "" ? undefined : resolveFolderParent(state, mutation.patch.parentFolderId, folder.id);
    }
    if (mutation.patch.weight !== undefined) folder.weight = clampNumber(mutation.patch.weight, 1, 10, folder.weight ?? 5);
    if (mutation.patch.canBlock !== undefined) folder.canBlock = mutation.patch.canBlock;
    if (mutation.patch.defaultBlockMinutes !== undefined) {
      folder.defaultBlockMinutes = clampNumber(mutation.patch.defaultBlockMinutes, 5, 480, folder.defaultBlockMinutes ?? 30);
    }
    if (mutation.patch.contextNote !== undefined) folder.contextNote = optionalText(mutation.patch.contextNote, folder.contextNote);
    folder.status = validFolderStatus(mutation.patch.status) ?? folder.status;
    return getState();
  }

  if (mutation.entity === "task") {
    if (mutation.action === "create") {
      const parentTaskId = resolveParentForChild(state, mutation.patch.parentTaskId);
      const parentTask = parentTaskId ? state.tasks.find((entry) => entry.id === parentTaskId) : undefined;
      // Placement is folder-only (T088 2c-C). A task may be unfiled (no folder).
      const folderId = (parentTask ? parentTask.folderId : undefined) ?? validFolderId(state, mutation.patch.folderId);
      const folder = folderId ? (state.folders ?? []).find((entry) => entry.id === folderId) : undefined;
      const keepAsSuggestion = mutation.patch.completionBehavior === "keep_as_suggestion";
      const type: Task["type"] = folder?.parentFolderId
        ? keepAsSuggestion
          ? "soft_invitation"
          : "project_task"
        : validTaskType(mutation.patch.type) ?? "atomic";
      state.tasks.push({
        id: uniqueStateId(state, "task"),
        title: cleanText(mutation.patch.title) || "New task",
        description: cleanText(mutation.patch.description) || undefined,
        type,
        folderId,
        parentTaskId,
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
        source: "manual",
        habit: mutation.patch.habit === true ? true : undefined // T092
      });
      return getState();
    }

    const task = state.tasks.find((entry) => entry.id === mutation.id);
    if (!task) return getState();
    if (mutation.action === "archive") {
      task.status = "archived";
      return getState();
    }

    if (mutation.patch.parentTaskId !== undefined) {
      const resolvedParent = resolveParentForChild(state, mutation.patch.parentTaskId, task.id);
      task.parentTaskId = resolvedParent;
      if (resolvedParent) {
        const parent = state.tasks.find((entry) => entry.id === resolvedParent)!;
        task.folderId = parent.folderId;
        const parentFolder = parent.folderId ? (state.folders ?? []).find((entry) => entry.id === parent.folderId) : undefined;
        task.type = parentFolder?.parentFolderId ? "project_task" : "atomic";
      }
    }
    // Folders are the only structure (T088 2c-C): folderId moves a task between folders. An empty
    // string clears it (task becomes unfiled/top-level). A child folder makes the task project-like.
    if (mutation.patch.folderId !== undefined) {
      const targetFolderId = mutation.patch.folderId === "" ? undefined : validFolderId(state, mutation.patch.folderId) ?? task.folderId;
      task.folderId = targetFolderId;
      const folder = targetFolderId ? (state.folders ?? []).find((entry) => entry.id === targetFolderId) : undefined;
      const isInChildFolder = Boolean(folder?.parentFolderId);
      task.type = isInChildFolder
        ? task.completionBehavior === "keep_as_suggestion"
          ? "soft_invitation"
          : "project_task"
        : task.type === "project_task"
          ? "atomic"
          : task.type;
    }
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
    // T092: explicit per-task habit flag (boolean only; false clears it).
    if (typeof mutation.patch.habit === "boolean") task.habit = mutation.patch.habit ? true : undefined;
    task.repeatPolicy = mutation.patch.repeatPolicy ? normalizeRepeatPolicy(mutation.patch.repeatPolicy) : task.repeatPolicy;
    if (Array.isArray(mutation.patch.tags)) {
      task.tags = mutation.patch.tags.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (mutation.patch.minMinutes !== undefined) {
      task.minMinutes = mutation.patch.minMinutes === null ? undefined : clampNumber(mutation.patch.minMinutes, 1, 720, task.minMinutes ?? task.effortMinutes);
    }
    if (mutation.patch.maxMinutes !== undefined) {
      task.maxMinutes = mutation.patch.maxMinutes === null ? undefined : clampNumber(mutation.patch.maxMinutes, 1, 720, task.maxMinutes ?? task.effortMinutes);
    }
    if (mutation.patch.schedulingMode) {
      task.scheduling = schedulingForMode(mutation.patch.schedulingMode, task.effortMinutes);
    }
    if (mutation.patch.dateIntentKind) {
      // Manual promote/demote (T072), sharing the AI's date-intent logic (T064).
      applyTaskDateIntent(state, task, mutation.patch.dateIntentKind, task.scheduledDate, task.dueDate);
    }
    // T090: a schedule edit (this is the endpoint the timeline drag and the move dialog post to)
    // replans the committed day within this same recorded change when it touches today.
    if (mutation.patch.scheduledDate !== undefined || mutation.patch.scheduledTime !== undefined || mutation.patch.dateIntentKind) {
      maybeReplanForScheduleChange(state, task);
    }
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
  recordChange("review", "Daily review");
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

export function updateFolderBlockSelection(input: {
  planItemId: string;
  taskId?: string;
  action: BlockSelectionAction;
}): AppState {
  recordChange("block_selection", "Folder block change");
  const state = currentState();
  const plan = dayView(state);
  const item = plan.items.find((entry) => entry.id === input.planItemId);
  if (!item || item.type !== "folder_block" || !item.folderId) return getState();
  const folderId = item.folderId;

  state.folderBlockSelections ??= [];
  const existing = state.folderBlockSelections.find(
    (selection) => selection.date === state.currentDate && selection.folderId === folderId
  );

  if (input.action === "regenerate") {
    state.folderBlockSelections = state.folderBlockSelections.filter(
      (selection) => !(selection.date === state.currentDate && selection.folderId === folderId)
    );
    replanWithinState(state); // T090: the committed block must reflect the regenerated selection
    return getState();
  }

  const currentSelection = existing?.selectedTaskIds ?? item.selectedTaskIds ?? [];
  let nextSelection = currentSelection;

  if (input.action === "add" && input.taskId && isSelectableBlockTask(state, folderId, input.taskId)) {
    nextSelection = [...currentSelection, input.taskId].filter((taskId, index, all) => all.indexOf(taskId) === index);
  }

  if (input.action === "remove" && input.taskId) {
    nextSelection = currentSelection.filter((taskId) => taskId !== input.taskId);
  }

  if (existing) {
    existing.selectedTaskIds = nextSelection;
    existing.updatedAt = timestampForState(state);
  } else {
    state.folderBlockSelections.push({
      date: state.currentDate,
      folderId,
      selectedTaskIds: nextSelection,
      updatedAt: timestampForState(state)
    });
  }

  replanWithinState(state); // T090: keep the committed block's selection/length in sync
  return getState();
}

export function completePlanItem(planItemId: string, actualMinutes?: number, completedTaskIds?: string[]): AppState {
  recordChange("complete", "Completed a plan item");
  const state = currentState();
  const plan = dayView(state);
  const item = plan.items.find((entry) => entry.id === planItemId);
  if (!item) return getState();

  if (item.type === "folder_block" && !completedTaskIds?.length) {
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

  if (item.type === "folder_block" && completedTaskIds?.length) {
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
  recordChange("defer", "Deferred a plan item");
  const state = currentState();
  const plan = dayView(state);
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
  recordChange("outcome", "Recorded a plan outcome");
  const state = currentState();
  const plan = dayView(state);
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

export async function submitInbox(
  input: string,
  interpreter?: AiInterpreter,
  history?: { source: string; summary: string }
): Promise<AppState> {
  recordChange(history?.source ?? "inbox", history?.summary ?? summarizeInbox(input));
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

  // Apply create_folder before create_task so tasks can link to a folder created in the
  // same message (T088 grouping). Display order (entry.actions) is preserved separately.
  const applyOrder = [...entry.actions].sort((left, right) => applyRank(left) - applyRank(right));
  for (const action of applyOrder) {
    applyAutoAction(state, action, input);
    recordAppliedEntity(session, action);
  }
  maybeReplanForActions(state, applyOrder); // T090: AI scheduling replans within this same change
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

// Proactive maintenance pass (T066): reuses the inbox apply/history machinery with an
// organizer interpreter, recorded as one undoable "organizer" change.
export async function runOrganizerPass(interpreter: AiInterpreter = defaultOrganizerInterpreter): Promise<AppState> {
  return submitInbox("Review my tasks and propose small, safe maintenance edits.", interpreter, {
    source: "organizer",
    summary: "Tidy-up pass"
  });
}

// Run the organizer at most once per local day (T069). Stamps the date after running so a second
// open the same day is a no-op. Undoable like any organizer pass.
export async function maybeRunDailyOrganizer(interpreter: AiInterpreter = defaultOrganizerInterpreter): Promise<AppState> {
  if (currentState().autoOrganizeEnabled === false) return getState(); // T074: user-disabled
  const today = currentState().currentDate;
  if (currentState().lastAutoOrganizeDate === today) return getState();
  await submitInbox("Daily maintenance: propose small, safe tidy-up edits.", interpreter, {
    source: "organizer",
    summary: "Daily tidy-up (auto)"
  });
  currentState().lastAutoOrganizeDate = today;
  return getState();
}

// Enable/disable the once-per-day auto organizer (T074). Not recorded in undo history (a setting,
// not a content change).
export function setAutoOrganizeEnabled(enabled: boolean): AppState {
  currentState().autoOrganizeEnabled = enabled;
  return getState();
}

export function setAvailableMinutes(minutes: number): AppState {
  currentState().availableMinutes = clampNumber(minutes, 90, 960, 300);
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
  maybeReplanForActions(state, [draftAction]); // T090
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

export async function addCaptureSessionMessage(
  sessionId: string,
  message: string,
  interpreter?: AiRevisionInterpreter,
  actionInterpreter?: AiInterpreter
): Promise<AppState> {
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
      maybeReplanForActions(state, [draftAction]); // T090
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
  if (!target || looksLikeBroadStateFollowUp(trimmed)) {
    await applyFullContextFollowUp(state, session, trimmed, actionInterpreter);
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
  maybeReplanForScheduleChange(state, target.task); // T090: "actually at 5pm" must reach the committed day
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

async function applyFullContextFollowUp(
  state: AppState,
  session: CaptureSession,
  message: string,
  interpreter?: AiInterpreter
): Promise<void> {
  const entry = await interpretInboxInput(message, state, interpreter);
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

  for (const action of [...entry.actions].sort((left, right) => applyRank(left) - applyRank(right))) {
    applyAutoAction(state, action, message);
    recordAppliedEntity(session, action);
    if (action.appliedEntityId && action.type !== "ask_clarification") {
      recordRevisionEvent(state, session, {
        source: "follow_up",
        actionId: action.id,
        taskId: action.type === "create_folder" ? undefined : action.appliedEntityId,
        model: action.model,
        confidence: action.validationErrors?.length ? 0.4 : 0.8,
        summary: entry.summary,
        changes: [action.label],
        after: action.type === "create_folder" ? undefined : taskSnapshotById(state, action.appliedEntityId)
      });
    }
  }

  maybeReplanForActions(state, entry.actions); // T090
  state.inbox.unshift(entry);
  session.status = session.questions.some((question) => question.status === "pending")
    ? "waiting_for_user"
    : entry.actions.every((action) => action.status === "applied")
      ? "applied"
      : "open";
  addAssistantSessionMessage(
    state,
    session,
    entry.actions.length ? `Updated the planner: ${entry.summary}` : `I checked the planner and did not make changes: ${entry.summary}`
  );
}

function looksLikeBroadStateFollowUp(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(folder|folders|project|projects|category|categories|personal stuff|regular tasks|not in a folder|shouldn'?t be in a folder|separate personal project|seperate personal project)\b/.test(
      lower
    ) || /\b(these|those|all of|the .* stuff|schematisis stuff|to do app)\b/.test(lower)
  );
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
  const appliedNow: AiAction[] = [];
  for (const actionId of session.actionIds) {
    const action = findAction(state, actionId);
    if (!action || action.type === "ask_clarification" || action.status !== "proposed") continue;
    if (action.validationErrors?.length) {
      action.status = "failed";
      action.skippedReason = "Cannot apply until validation errors are resolved.";
      continue;
    }
    applyAction(state, action, true);
    appliedNow.push(action);
  }
  maybeReplanForActions(state, appliedNow); // T090
  session.status = session.questions.some((question) => question.status === "pending") ? "waiting_for_user" : "applied";
  session.updatedAt = timestampForState(state);
  return getState();
}

export function confirmAiAction(actionId: string): AppState {
  recordChange("confirm", "Confirmed an AI action");
  const state = currentState();
  const action = findAction(state, actionId);
  if (!action || action.status !== "proposed") return getState();
  if (action.validationErrors?.length) {
    action.status = "failed";
    action.skippedReason = "Cannot confirm until validation errors are resolved.";
    return getState();
  }
  applyAction(state, action, true);
  maybeReplanForActions(state, [action]); // T090
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
  // create_folder must run before create_task so same-batch tasks can link to it (T088).
  return action.type === "create_folder" ? 0 : 1;
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
  } else if (kind === "none") {
    task.scheduledDate = undefined;
    task.scheduledTime = undefined;
    task.dueDate = undefined;
    task.plannerFields.pressureLevel = "soft";
    task.dateIntent = { kind: "none", confidence: 0.3 };
  }
}

// Resolve a create_task's intended folder name/path to a real folderId at apply time — covers a
// folder created earlier in the same batch (T088 grouping). Derives the task type from the folder.
function linkPendingFolder(state: AppState, action: AiAction, payload: Omit<Task, "id">): void {
  if (!action.pendingFolderName) return;
  const folder = findFolderMention(state, action.pendingFolderName);
  if (!folder) return;
  payload.folderId = folder.id;
  payload.type = folder.parentFolderId
    ? "project_task"
    : payload.completionBehavior === "keep_as_suggestion"
      ? "soft_invitation"
      : "atomic";
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
    linkPendingFolder(state, action, payload);
    const existing = state.tasks.find((task) => isSameCreateTaskIdentity(task, payload));
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
    const existingScheduleTarget = state.tasks.find((task) => canApplyCreateScheduleToExisting(task, payload));
    if (existingScheduleTarget && applyTaskSchedulePatch(state, existingScheduleTarget, action.payload)) {
      action.status = "applied";
      action.appliedEntityId = existingScheduleTarget.id;
      action.skippedReason = "Updated existing task schedule instead of duplicating it.";
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

  if (action.type === "schedule_block") {
    const payload = action.payload as { folderId?: string; date?: string; minutes?: number };
    const folderId = typeof payload.folderId === "string" ? payload.folderId : undefined;
    const folder = folderId ? (state.folders ?? []).find((entry) => entry.id === folderId && entry.status !== "archived") : undefined;
    if (!folder || folder.canBlock !== true) {
      action.status = "failed";
      action.skippedReason = "Could not find a blockable folder.";
      return;
    }
    const date = validDate(payload.date) ? payload.date : state.currentDate;
    const selectedTaskIds = defaultFolderBlockTaskIds(state, folder.id, date);
    if (!selectedTaskIds.length) {
      action.status = "failed";
      action.skippedReason = "Could not find tasks to place in the folder block.";
      return;
    }
    state.folderBlockSelections ??= [];
    const existing = state.folderBlockSelections.find((selection) => selection.date === date && selection.folderId === folder.id);
    if (existing) {
      existing.selectedTaskIds = selectedTaskIds;
      existing.updatedAt = timestampForState(state);
    } else {
      state.folderBlockSelections.push({
        date,
        folderId: folder.id,
        selectedTaskIds,
        updatedAt: timestampForState(state)
      });
    }
    if (typeof payload.minutes === "number") {
      folder.defaultBlockMinutes = clampNumber(payload.minutes, 5, 480, folder.defaultBlockMinutes ?? 30);
    }
    action.status = "applied";
    action.appliedEntityId = folder.id;
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
    const payload = action.payload as {
      priority?: number;
      importance?: number;
      urgency?: number;
      dateIntent?: string;
      scheduledDate?: string;
      dueDate?: string;
      folderName?: string;
      clearFolder?: boolean;
    };
    if (payload.clearFolder) {
      task.folderId = undefined;
      task.type = task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "atomic";
    } else if (payload.folderName) {
      const folder = findFolderMention(state, payload.folderName);
      if (folder) {
        task.folderId = folder.id;
        task.type = folder.parentFolderId ? "project_task" : task.completionBehavior === "keep_as_suggestion" ? "soft_invitation" : "atomic";
      } else {
        action.status = "failed";
        action.skippedReason = "Could not find the folder to move the task.";
        return;
      }
    }
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

  if (action.type === "create_folder") {
    // T088: create_folder pushes a Folder onto the canonical folders store. Back-compat
    // domains/projects are re-derived by normalizeState on the next read.
    state.folders ??= [];
    const folder: Folder = {
      id: nextId("folder"),
      ...(action.payload as Omit<Folder, "id" | "status">),
      status: "active"
    };
    state.folders.push(folder);
    action.status = "applied";
    action.appliedEntityId = folder.id;
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
      task.type = task.type === "project_task" ? "project_task" : "atomic";
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
    folderId: task.folderId,
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

  const lowerMessage = message.toLowerCase();
  const folderMatches = (state.folders ?? []).filter(
    (candidate) => candidate.status !== "archived" && lowerMessage.includes(candidate.name.toLowerCase())
  );
  // Prefer a child folder (legacy "project" role) over a top-level one when both names appear.
  const folder = folderMatches.find((candidate) => candidate.parentFolderId) ?? folderMatches[0];
  if (folder) {
    task.folderId = folder.id;
    task.type = folder.parentFolderId
      ? "project_task"
      : task.completionBehavior === "keep_as_suggestion"
        ? "soft_invitation"
        : "atomic";
    if (folder.parentFolderId) task.plannerFields.intentType = "progress";
    changes.push(`moved under ${folder.name}`);
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

  const folder = revision.folderName ? findFolderMention(state, revision.folderName) : undefined;
  if (folder) {
    task.folderId = folder.id;
    task.type = folder.parentFolderId
      ? "project_task"
      : task.completionBehavior === "keep_as_suggestion"
        ? "soft_invitation"
        : "atomic";
    if (folder.parentFolderId) task.plannerFields.intentType = "progress";
    changes.push(`moved under ${folder.name}`);
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

function isSameCreateTaskIdentity(task: Task, payload: Omit<Task, "id">): boolean {
  if (task.status === "archived") return false;
  if (!hasSameTaskPlacement(task, payload)) return false;
  if (repeatPolicyKey(task.repeatPolicy) !== repeatPolicyKey(payload.repeatPolicy)) return false;

  if (!hasPayloadSchedule(payload)) return true;

  // Same-title tasks on different dates are legitimate separate planner items (e.g. yoga tonight
  // and yoga tomorrow). Deduping must respect the model's date split.
  if ((task.scheduledDate ?? null) !== (payload.scheduledDate ?? null)) return false;
  if ((task.scheduledTime ?? null) !== (payload.scheduledTime ?? null)) return false;
  if ((task.dueDate ?? null) !== (payload.dueDate ?? null)) return false;

  return true;
}

function canApplyCreateScheduleToExisting(task: Task, payload: Omit<Task, "id">): boolean {
  if (task.status === "archived") return false;
  if (!hasSameTaskPlacement(task, payload)) return false;
  if (!hasPayloadSchedule(payload)) return false;

  // Capturing "Clean garage this weekend" when "Clean garage" already exists should schedule the
  // existing undated task. Capturing "Yoga" for today and again for tomorrow should create two
  // dated instances, not rewrite the first.
  if (!hasTaskSchedule(task)) return true;
  if (payload.scheduledDate && task.scheduledDate && payload.scheduledDate !== task.scheduledDate) return false;
  if (payload.scheduledTime && task.scheduledTime && payload.scheduledTime !== task.scheduledTime) return false;
  return Boolean(
    (payload.scheduledDate && task.scheduledDate === payload.scheduledDate && !task.scheduledTime && payload.scheduledTime) ||
      (payload.scheduledTime && task.scheduledDate === payload.scheduledDate && !task.scheduledTime) ||
      (payload.dueDate && !task.scheduledDate)
  );
}

function hasSameTaskPlacement(task: Task, payload: Omit<Task, "id">): boolean {
  return task.title.toLowerCase() === payload.title.toLowerCase() && (task.folderId ?? null) === (payload.folderId ?? null);
}

function hasTaskSchedule(task: Task): boolean {
  return Boolean(task.scheduledDate || task.scheduledTime || task.dueDate);
}

function hasPayloadSchedule(payload: Omit<Task, "id">): boolean {
  return Boolean(payload.scheduledDate || payload.scheduledTime || payload.dueDate);
}

function repeatPolicyKey(policy: Task["repeatPolicy"] | undefined): string {
  if (!policy || policy.type === "none") return "none";
  if (policy.type === "daily") return `daily:${policy.carryover ?? ""}`;
  if (policy.type === "weekly") return `weekly:${[...(policy.days ?? [])].sort().join(",")}:${policy.carryover ?? ""}`;
  return JSON.stringify(policy);
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

// Resolve a folderName to an active folder by exact name or exact full path. No substring matching:
// "Housework" and "Work" are different folders.
function findFolderMention(state: AppState, name: string): Folder | undefined {
  const folders = (state.folders ?? []).filter((folder) => folder.status !== "archived");
  const lower = name.trim().toLowerCase();
  if (!lower) return undefined;
  if (lower.includes("/")) {
    const pathMatch = folders.find((folder) => (folderFullPath(state, folder.id) ?? "").toLowerCase() === lower);
    if (pathMatch) return pathMatch;
  }

  const exactNameMatches = folders.filter((folder) => folder.name.toLowerCase() === lower);
  if (exactNameMatches.length === 1) return exactNameMatches[0];

  // Preserve the pre-folder-unification behavior for duplicated area/project labels while avoiding
  // fuzzy partial matches. For task placement, the child folder is the more specific target.
  return exactNameMatches.find((folder) => folder.parentFolderId);
}

// Full "A / B / C" path for a folder, walking parentFolderId with cycle guard.
function folderFullPath(state: AppState, folderId: string): string | undefined {
  const list = state.folders ?? [];
  const byId = new Map(list.map((folder) => [folder.id, folder]));
  const seen = new Set<string>();
  const names: string[] = [];
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }
  return names.length ? names.join(" / ") : undefined;
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

function uniqueStateId(state: AppState, prefix: "task"): string {
  const ids = state.tasks.map((entry) => entry.id);
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

function uniqueFolderId(state: AppState): string {
  const ids = (state.folders ?? []).map((folder) => folder.id);
  let index = ids.reduce((max, id) => {
    const match = id.match(/^folder_(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  let next: string;
  do {
    index += 1;
    next = `folder_${index.toString().padStart(4, "0")}`;
  } while (ids.includes(next));
  return next;
}

function validFolderStatus(value: unknown): Folder["status"] | undefined {
  return value === "active" || value === "archived" ? value : undefined;
}

function validFolderId(state: AppState, value: unknown): string | undefined {
  return typeof value === "string" && (state.folders ?? []).some((folder) => folder.id === value) ? value : undefined;
}

function isSelectableBlockTask(state: AppState, folderId: string, taskId: string): boolean {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task || task.status === "archived" || blockFolderId(state, task) !== folderId) return false;
  if (task.status === "blocked" && !task.blocked?.unblockAction) return false;
  if (task.status === "waiting" && !task.waiting?.followUpDate) return false;
  return true;
}

function defaultFolderBlockTaskIds(state: AppState, folderId: string, date: string): string[] {
  return state.tasks
    .filter((task) => {
      if (!isSelectableBlockTask(state, folderId, task.id)) return false;
      if (hasActiveChildren(state, task.id)) return false;
      if (task.completionBehavior === "keep_as_suggestion") return false;
      if (task.scheduledDate && task.scheduledDate !== date) return false;
      return true;
    })
    .sort((left, right) => right.priority + right.importance + right.urgency - (left.priority + left.importance + left.urgency))
    .slice(0, 3)
    .map((task) => task.id);
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

function taskActionPatch(task: Task): Record<string, unknown> {
  return {
    folderId: task.folderId,
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
    (state.folders ?? []).find((folder) => folder.id === entityId)?.name ??
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
