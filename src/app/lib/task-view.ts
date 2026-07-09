import { isDateInRange, nextWeekRange, weekRange } from "@/lib/dates";
import type { AppState, DayPlan } from "@/lib/types";
import { formatShortDate } from "./format";

type Task = AppState["tasks"][number];

export function buildTaskGroups(state: AppState, plan: DayPlan): { title: string; description: string; tasks: Task[] }[] {
  const plannedTaskIds = new Set(plan.items.flatMap((item) => [...(item.taskId ? [item.taskId] : []), ...(item.selectedTaskIds ?? [])]));
  const openTasks = state.tasks.filter((task) => !["completed", "archived"].includes(task.status));
  const plannedToday = openTasks.filter((task) => plannedTaskIds.has(task.id));
  const blockedWaiting = openTasks.filter((task) => ["blocked", "waiting"].includes(task.status));
  const background = openTasks.filter((task) => task.scheduling && task.scheduling.mode !== "exclusive");
  const nextWeek = openTasks.filter((task) => !plannedTaskIds.has(task.id) && isTaskInNamedWeek(task, state.currentDate, "next"));
  const thisWeek = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      isTaskInNamedWeek(task, state.currentDate, "this")
  );
  const someday = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      !thisWeek.some((candidate) => candidate.id === task.id) &&
      isSomedayTask(task)
  );
  const loose = openTasks.filter(
    (task) =>
      !plannedTaskIds.has(task.id) &&
      !nextWeek.some((candidate) => candidate.id === task.id) &&
      !thisWeek.some((candidate) => candidate.id === task.id) &&
      !someday.some((candidate) => candidate.id === task.id) &&
      !blockedWaiting.some((candidate) => candidate.id === task.id)
  );

  return [
    { title: "Planned today", description: "Visible in the current day timeline or project block.", tasks: sortTasks(plannedToday) },
    { title: "This week backlog", description: "Due, scheduled, or windowed inside the current week but not on this day.", tasks: sortTasks(thisWeek) },
    { title: "Next week backlog", description: "Captured for next week without needing a full calendar view.", tasks: sortTasks(nextWeek) },
    { title: "Someday / suggestions", description: "Soft ideas and reusable suggestions that should not compete with urgent work.", tasks: sortTasks(someday) },
    { title: "Blocked / waiting", description: "Items that need an unblock action, person, or external event.", tasks: sortTasks(blockedWaiting) },
    { title: "Background / phased", description: "Work that can overlap, run passively, or return in phases.", tasks: sortTasks(background) },
    { title: "Loose backlog", description: "Active tasks without a strong date intent yet.", tasks: sortTasks(loose) }
  ];
}

export function buildBacklogSummary(state: AppState, plan: DayPlan) {
  const groups = buildTaskGroups(state, plan);
  const count = (title: string) => groups.find((group) => group.title === title)?.tasks.length ?? 0;
  const thisWeek = count("This week backlog");
  const nextWeek = count("Next week backlog");
  const someday = count("Someday / suggestions");
  const blocked = count("Blocked / waiting");
  return {
    thisWeek,
    nextWeek,
    someday,
    text: `${thisWeek + nextWeek} dated backlog tasks outside this day, ${someday} soft items, ${blocked} blocked or waiting.`
  };
}

export function buildClientReviewSummary(state: AppState) {
  const date = state.currentDate;
  const events = state.executionEvents.filter((event) => event.date === date);
  const completions = state.completions.filter((event) => event.date === date);
  const completedPlanIds = new Set([...events.filter((event) => event.type === "completed").map((event) => event.planItemId), ...completions.map((event) => event.planItemId)].filter(Boolean) as string[]);
  const partialEvents = events.filter((event) => event.type === "worked_on" || event.type === "partially_completed");
  const deferredEvents = events.filter((event) => event.type === "deferred");
  const blockedEvents = events.filter((event) => event.type === "blocked" || event.type === "waiting_on");
  const skippedEvents = events.filter((event) => ["skipped", "canceled", "marked_not_important"].includes(event.type));
  const deferrals = state.deferrals.filter((entry) => entry.date === date);
  const deferredPlanIds = new Set([...deferredEvents.map((event) => event.planItemId), ...deferrals.map((entry) => entry.planItemId)].filter(Boolean) as string[]);
  const calibrationSignals = [];
  const overloadCount = deferrals.filter((entry) => ["no_time", "overplanned"].includes(entry.reason)).length;
  const lowEnergyCount = deferrals.filter((entry) => entry.reason === "low_energy").length;
  const vagueCount = events.filter((event) => event.reason === "too_vague").length;
  const blockedCount = blockedEvents.length;
  if (overloadCount) calibrationSignals.push(`${overloadCount} time/load deferral${overloadCount === 1 ? "" : "s"}`);
  if (lowEnergyCount) calibrationSignals.push(`${lowEnergyCount} low-energy deferral${lowEnergyCount === 1 ? "" : "s"}`);
  if (vagueCount) calibrationSignals.push(`${vagueCount} vague item${vagueCount === 1 ? "" : "s"} need sharper next actions`);
  if (blockedCount) calibrationSignals.push(`${blockedCount} blocked/waiting item${blockedCount === 1 ? "" : "s"}`);

  return {
    completedCount: completedPlanIds.size,
    partialCount: partialEvents.length,
    deferredCount: deferredPlanIds.size,
    blockedCount: blockedEvents.length,
    skippedCount: skippedEvents.length,
    completedTitles: [...completedPlanIds].map((planItemId) => clientPlanTitleFromId(state, date, planItemId)),
    partialTitles: partialEvents.map((event) => clientEventTitle(state, date, event)),
    deferredTitles: [...deferredPlanIds].map((planItemId) => clientPlanTitleFromId(state, date, planItemId)),
    blockedTitles: blockedEvents.map((event) => clientEventTitle(state, date, event)),
    skippedTitles: skippedEvents.map((event) => clientEventTitle(state, date, event)),
    calibrationSignals,
    existingReview: state.dailyReviews.find((review) => review.date === date)
  };
}

export function clientEventTitle(state: AppState, date: string, event: AppState["executionEvents"][number]): string {
  if (event.taskId) return state.tasks.find((task) => task.id === event.taskId)?.title ?? event.taskId;
  if (event.taskIds?.[0]) return state.tasks.find((task) => task.id === event.taskIds?.[0])?.title ?? event.taskIds[0];
  return event.planItemId ? clientPlanTitleFromId(state, date, event.planItemId) : "Untitled item";
}

export function clientPlanTitleFromId(state: AppState, date: string, planItemId: string): string {
  const prefix = `plan_${date}_`;
  const entityId = planItemId.startsWith(prefix) ? planItemId.slice(prefix.length).replace(/_phase_\d+$/, "") : planItemId;
  return (
    state.tasks.find((task) => task.id === entityId)?.title ??
    (state.folders ?? []).find((folder) => folder.id === entityId)?.name ??
    planItemId
  );
}

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.priority + b.importance + b.urgency - (a.priority + a.importance + a.urgency));
}

export function isTaskInNamedWeek(task: Task, currentDate: string, target: "this" | "next"): boolean {
  const range = target === "this" ? weekRange(currentDate) : nextWeekRange(currentDate);
  if (isDateInRange(task.scheduledDate, range.startDate, range.endDate)) return true;
  if (isDateInRange(task.dueDate, range.startDate, range.endDate)) return true;
  if (task.dateIntent?.kind === "week_window") {
    return Boolean(task.dateIntent.startDate && task.dateIntent.endDate && task.dateIntent.startDate <= range.endDate && task.dateIntent.endDate >= range.startDate);
  }
  if (task.dateIntent?.kind === "deadline") return isDateInRange(task.dateIntent.dueDate, range.startDate, range.endDate);
  if (task.dateIntent?.kind === "specific_date" || task.dateIntent?.kind === "today" || task.dateIntent?.kind === "tomorrow") {
    return isDateInRange(task.dateIntent.scheduledDate, range.startDate, range.endDate);
  }
  return false;
}

export function isSomedayTask(task: Task): boolean {
  return (
    task.dateIntent?.kind === "someday" ||
    task.completionBehavior === "keep_as_suggestion" ||
    task.plannerFields.pressureLevel === "someday" ||
    task.plannerFields.pressureLevel === "soft"
  );
}

export function dateIntentLabel(task: Task): string {
  if (task.dateIntent?.kind === "week_window" && task.dateIntent.startDate && task.dateIntent.endDate) {
    return `${formatShortDate(task.dateIntent.startDate)}-${formatShortDate(task.dateIntent.endDate)}`;
  }
  if (task.dateIntent?.kind === "deadline" && task.dateIntent.dueDate) return `due ${formatShortDate(task.dateIntent.dueDate)}`;
  if (task.dateIntent?.kind === "specific_date" && task.dateIntent.scheduledDate) return formatShortDate(task.dateIntent.scheduledDate);
  if (task.dateIntent?.kind && task.dateIntent.kind !== "none") return task.dateIntent.kind.replace("_", " ");
  if (task.scheduledDate) return formatShortDate(task.scheduledDate);
  if (task.dueDate) return `due ${formatShortDate(task.dueDate)}`;
  return task.plannerFields.pressureLevel;
}

// Client mirror of planner.blockFolderId (T088 2c-A): nearest ancestor-or-self folder (walking
// task.folderId up via parentFolderId, cycle-guarded) whose canBlock === true and not archived.
export function clientBlockFolderId(state: AppState, task: AppState["tasks"][number]): string | undefined {
  const folders = state.folders ?? [];
  let current = task.folderId ? folders.find((folder) => folder.id === task.folderId) : undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.canBlock === true && current.status !== "archived") return current.id;
    current = current.parentFolderId ? folders.find((folder) => folder.id === current!.parentFolderId) : undefined;
  }
  return undefined;
}

export type BacklogBucket = "today" | "this_week" | "next_week" | "someday" | "none";

export const BACKLOG_COLUMNS: { key: BacklogBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "next_week", label: "Next week" },
  { key: "someday", label: "Someday" },
  { key: "none", label: "Unscheduled" }
];

// Which backlog column a task currently belongs in (T072).
export function taskBucket(task: AppState["tasks"][number], currentDate: string): BacklogBucket {
  const intent = task.dateIntent;
  if (task.scheduledDate === currentDate || intent?.kind === "today" || intent?.kind === "tomorrow") return "today";
  if (intent?.kind === "someday") return "someday";
  const thisWeek = weekRange(currentDate);
  const nextWeek = nextWeekRange(currentDate);
  if (intent?.kind === "week_window") {
    return intent.startDate === nextWeek.startDate ? "next_week" : "this_week";
  }
  if (task.scheduledDate) {
    if (isDateInRange(task.scheduledDate, thisWeek.startDate, thisWeek.endDate)) return "this_week";
    if (isDateInRange(task.scheduledDate, nextWeek.startDate, nextWeek.endDate)) return "next_week";
  }
  if (task.dueDate) {
    if (task.dueDate <= thisWeek.endDate) return "this_week";
    if (task.dueDate <= nextWeek.endDate) return "next_week";
  }
  return "none";
}

// Subtask rollup for a parent task (T071/T076): recursive count, completed count, and aggregate
// effort across all descendants.
export function childStats(state: AppState, taskId: string): { count: number; done: number; minutes: number } {
  const children = state.tasks.filter((task) => task.parentTaskId === taskId && task.status !== "archived");
  let count = 0;
  let done = 0;
  let minutes = 0;
  for (const child of children) {
    count += 1;
    minutes += child.effortMinutes;
    if (child.status === "completed") done += 1;
    const sub = childStats(state, child.id);
    count += sub.count;
    done += sub.done;
    minutes += sub.minutes;
  }
  return { count, done, minutes };
}

// True if `nodeId` is within the subtree rooted at `ancestorId` (T076 cycle guard for the UI).
export function isDescendantOfClient(state: AppState, nodeId: string, ancestorId: string): boolean {
  let current = state.tasks.find((task) => task.id === nodeId);
  const seen = new Set<string>();
  while (current?.parentTaskId && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.parentTaskId === ancestorId) return true;
    current = state.tasks.find((task) => task.id === current!.parentTaskId);
  }
  return false;
}
