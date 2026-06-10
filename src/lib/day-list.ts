// T092: list-first Today. The day's commitment is the user's hand-authored LIST (DayList in
// state.dayLists), not a generated schedule — the system ADVISES the list (tray, gauges, habit
// strip) instead of authoring the day. Everything here is a pure function over AppState:
// buildMorningList constructs the day's starting list, renderDayList produces the read model the
// Today surface consumes. state.ts owns when lists are created and mutated (ensureDayList +
// explicit, undoable list mutations), mirroring the T090 committed-plan split with day-view.ts.
import { addDays, timeToMinutes } from "./dates";
import { stateTimestamp } from "./day-view";
import { calculateCapacity, hasActiveChildren, isRepeatPolicyDue, isTaskPlannable, taskScore } from "./planner";
import type { AppState, DayList, DayListEntry, DayListSource, Folder, Task } from "./types";

// Sources that represent user intent and therefore carry over to the next day when unfinished.
// "recurring" entries do NOT carry — the next morning build re-adds them if they are due again.
const CARRIED_SOURCES: ReadonlySet<DayListSource> = new Set(["manual", "tray", "ai", "carried"]);

const MAX_STREAK_WALK_DAYS = 365;
const TRAY_BACKLOG_LIMIT = 5;
const TRAY_BALANCE_LIMIT = 3;

export interface DayListEntryView {
  taskId: string;
  title: string;
  folderId?: string;
  folderPath?: string;
  pinnedTime?: string;
  source: DayListSource;
  order: number;
  effortMinutes: number;
  completedToday: boolean;
  // Display metadata: the pinned time has passed and the entry is still unticked.
  missedPin?: boolean;
}

export interface DayListHabitView {
  taskId: string;
  title: string;
  effortMinutes: number;
  completedToday: boolean;
  streak: number;
}

export interface DayListTrayTask {
  taskId: string;
  title: string;
  folderId?: string;
  folderPath?: string;
  effortMinutes: number;
  dueDate?: string;
  scheduledDate?: string;
  // For balance suggestions: the missing pillar this task would fill.
  pillarName?: string;
}

export interface DayListPillarShare {
  folderId: string;
  name: string;
  minutes: number;
  share: number;
}

export interface DayListGauges {
  // calculateCapacity vs the sum of UNcompleted list-entry efforts: the day-too-big/too-small
  // problem is solved by this gauge, not by scheduling.
  capacityMinutes: number;
  listMinutes: number;
  // Pillar mix (top-ancestor folder) of list + habit tasks, completed included.
  balance: DayListPillarShare[];
  missingPillars: string[];
}

export interface DayListView {
  date: string;
  committedAt: string;
  entries: DayListEntryView[];
  habits: DayListHabitView[];
  tray: { due: DayListTrayTask[]; balance: DayListTrayTask[]; backlog: DayListTrayTask[] };
  gauges: DayListGauges;
}

export function findDayList(state: AppState, date: string): DayList | undefined {
  return (state.dayLists ?? []).find((list) => list.date === date);
}

// Morning build for `date`:
//   (a) due recurring non-habit tasks (planner due/plannable semantics), source "recurring";
//   (b) tasks dated today (scheduledDate/dueDate === date), source "recurring" if they repeat
//       else "manual";
//   (c) unfinished manual/tray/ai/carried entries from the most recent previous list, re-added
//       with source "carried".
// Dedupe by taskId with priority a > b > c. Order: recurring/dated by taskScore desc, then
// carried in their previous relative order. pinnedTime carries from task.scheduledTime when the
// task is scheduled for this date.
export function buildMorningList(state: AppState, date: string): DayList {
  const plannable = state.tasks.filter((task) => !task.habit && !hasActiveChildren(state, task.id) && isTaskPlannable(task, date));
  const recurringDue = plannable.filter((task) => task.repeatPolicy.type !== "none" && task.completionBehavior !== "keep_as_suggestion");
  const datedToday = plannable.filter((task) => task.scheduledDate === date || task.dueDate === date);
  const scored = dedupeTasks([...recurringDue, ...datedToday]).sort((a, b) => taskScore(state, b, date) - taskScore(state, a, date));

  const previous = [...(state.dayLists ?? [])]
    .filter((list) => list.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  const carried = (previous?.entries ?? [])
    .filter((entry) => CARRIED_SOURCES.has(entry.source))
    .sort((a, b) => a.order - b.order)
    .flatMap((entry) => {
      const task = state.tasks.find((candidate) => candidate.id === entry.taskId);
      if (!task || task.habit) return [];
      if (task.status !== "active" && task.status !== "scheduled") return []; // completed/archived/blocked/waiting do not carry
      if (taskCompletedOnDate(state, task, previous!.date)) return []; // a repeatable ticked that day is finished, not unfinished
      if (!isTaskPlannable(task, date)) return []; // e.g. the user re-dated it to another day
      return [task];
    });

  const entries: DayListEntry[] = [];
  const seen = new Set<string>();
  const push = (task: Task, source: DayListSource) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    entries.push({
      taskId: task.id,
      order: entries.length,
      pinnedTime: task.scheduledDate === date && task.scheduledTime ? task.scheduledTime : undefined,
      source
    });
  };
  for (const task of scored) push(task, task.repeatPolicy.type !== "none" ? "recurring" : "manual");
  for (const task of carried) push(task, "carried");

  return { date, committedAt: stateTimestamp(state), entries };
}

// The read model the Today surface consumes: the list (sorted by order — pins are display
// metadata, not a sort key), the habit strip with streaks, the tray (due / balance / backlog),
// and the capacity + pillar-balance gauges.
export function renderDayList(state: AppState, list: DayList): DayListView {
  const date = list.date;
  const nowMinutes = timeToMinutes(state.currentTime);
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));

  const entries: DayListEntryView[] = [...list.entries]
    .sort((a, b) => a.order - b.order)
    .flatMap((entry) => {
      const task = taskById.get(entry.taskId);
      if (!task || task.status === "archived") return [];
      const completedToday = taskCompletedOnDate(state, task, date);
      const missedPin = Boolean(
        entry.pinnedTime && !completedToday && date === state.currentDate && timeToMinutes(entry.pinnedTime) <= nowMinutes
      );
      return [
        {
          taskId: task.id,
          title: task.title,
          folderId: task.folderId,
          folderPath: task.folderId ? folderPath(state, task.folderId) : undefined,
          pinnedTime: entry.pinnedTime,
          source: entry.source,
          order: entry.order,
          effortMinutes: task.effortMinutes,
          completedToday,
          missedPin: missedPin || undefined
        }
      ];
    });

  const habitTasks = state.tasks.filter((task) => task.habit && task.status !== "archived" && isRepeatPolicyDue(task, date));
  const habits: DayListHabitView[] = habitTasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    effortMinutes: task.effortMinutes,
    completedToday: taskCompletedOnDate(state, task, date),
    streak: habitStreak(state, task, date)
  }));

  // Tray candidates: plannable, non-habit, not already on the list, not already ticked today.
  const listTaskIds = new Set(list.entries.map((entry) => entry.taskId));
  const trayCandidates = state.tasks.filter(
    (task) =>
      !task.habit &&
      !listTaskIds.has(task.id) &&
      !hasActiveChildren(state, task.id) &&
      isTaskPlannable(task, date) &&
      !taskCompletedOnDate(state, task, date)
  );

  // Due: recurring-due or dated/deadline (incl. overdue) work the user removed or never added.
  const due = trayCandidates.filter(
    (task) =>
      task.completionBehavior !== "keep_as_suggestion" &&
      (task.repeatPolicy.type !== "none" || task.scheduledDate === date || Boolean(task.dueDate && task.dueDate <= date))
  );
  const dueIds = new Set(due.map((task) => task.id));

  const backlog = trayCandidates
    .filter((task) => !dueIds.has(task.id) && task.completionBehavior !== "keep_as_suggestion" && task.type !== "soft_invitation")
    .sort((a, b) => taskScore(state, b, date) - taskScore(state, a, date))
    .slice(0, TRAY_BACKLOG_LIMIT);

  // Pillar mix of the committed day (list entries + habits, completed included).
  const mixTasks = [...entries.flatMap((entry) => (taskById.has(entry.taskId) ? [taskById.get(entry.taskId)!] : [])), ...habitTasks];
  const presentPillarIds = new Set(mixTasks.map((task) => topAncestorFolder(state, task.folderId)?.id ?? "unfiled"));
  const pillars = (state.folders ?? []).filter((folder) => !folder.parentFolderId && folder.status !== "archived");
  const missingPillarFolders = pillars.filter((folder) => !presentPillarIds.has(folder.id));
  const missingPillarIds = new Set(missingPillarFolders.map((folder) => folder.id));

  // Balance fillers: soft invitations whose pillar is missing from the day's mix.
  const balanceTray = trayCandidates
    .map((task) => ({ task, pillar: topAncestorFolder(state, task.folderId) }))
    .filter(
      ({ task, pillar }) =>
        (task.completionBehavior === "keep_as_suggestion" || task.type === "soft_invitation") &&
        pillar !== undefined &&
        missingPillarIds.has(pillar.id)
    )
    .slice(0, TRAY_BALANCE_LIMIT);

  const listMinutes = entries.filter((entry) => !entry.completedToday).reduce((sum, entry) => sum + entry.effortMinutes, 0);
  const minutesByPillar = new Map<string, DayListPillarShare>();
  for (const task of mixTasks) {
    const pillar = topAncestorFolder(state, task.folderId);
    const key = pillar?.id ?? "unfiled";
    const bucket = minutesByPillar.get(key) ?? { folderId: key, name: pillar?.name ?? "Unfiled", minutes: 0, share: 0 };
    bucket.minutes += task.effortMinutes;
    minutesByPillar.set(key, bucket);
  }
  const mixTotalMinutes = [...minutesByPillar.values()].reduce((sum, bucket) => sum + bucket.minutes, 0);
  const balance = [...minutesByPillar.values()]
    .map((bucket) => ({ ...bucket, share: mixTotalMinutes ? bucket.minutes / mixTotalMinutes : 0 }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    date,
    committedAt: list.committedAt,
    entries,
    habits,
    tray: {
      due: due.map((task) => trayTaskView(state, task)),
      balance: balanceTray.map(({ task, pillar }) => trayTaskView(state, task, pillar?.name)),
      backlog: backlog.map((task) => trayTaskView(state, task))
    },
    gauges: {
      capacityMinutes: calculateCapacity(state),
      listMinutes,
      balance,
      missingPillars: missingPillarFolders.map((folder) => folder.name)
    }
  };
}

// Completion semantics shared by the list, habit strip, and tray: a task counts as done on a date
// when a completion/execution event for that date includes it, or its completedAt/lastCompletedAt
// falls on that date (covers repeatable tasks, whose status snaps back to "active").
export function taskCompletedOnDate(state: AppState, task: Task, date: string): boolean {
  if (task.completedAt?.slice(0, 10) === date || task.lastCompletedAt?.slice(0, 10) === date) return true;
  if (state.completions.some((event) => event.date === date && event.taskIds?.includes(task.id))) return true;
  return state.executionEvents.some(
    (event) => event.date === date && event.type === "completed" && (event.taskId === task.id || event.taskIds?.includes(task.id) === true)
  );
}

// Habit streak: consecutive completed days ending today (or yesterday, so an unticked morning
// does not zero the streak). Derived from the persistent completions/executionEvents history
// plus lastCompletedAt; the walk is capped at a year.
function habitStreak(state: AppState, task: Task, today: string): number {
  const completedDates = new Set<string>();
  for (const event of state.completions) {
    if (event.taskIds?.includes(task.id)) completedDates.add(event.date);
  }
  for (const event of state.executionEvents) {
    if (event.type === "completed" && (event.taskId === task.id || event.taskIds?.includes(task.id) === true)) completedDates.add(event.date);
  }
  if (task.lastCompletedAt) completedDates.add(task.lastCompletedAt.slice(0, 10));

  let cursor = completedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (streak < MAX_STREAK_WALK_DAYS && completedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function trayTaskView(state: AppState, task: Task, pillarName?: string): DayListTrayTask {
  return {
    taskId: task.id,
    title: task.title,
    folderId: task.folderId,
    folderPath: task.folderId ? folderPath(state, task.folderId) : undefined,
    effortMinutes: task.effortMinutes,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    pillarName
  };
}

// A task's pillar = the top-most ancestor folder of its folderId (cycle-guarded walk).
function topAncestorFolder(state: AppState, folderId: string | undefined): Folder | undefined {
  const folders = state.folders ?? [];
  let current = folderId ? folders.find((folder) => folder.id === folderId) : undefined;
  const seen = new Set<string>();
  while (current && current.parentFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = folders.find((folder) => folder.id === current!.parentFolderId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

// Full "A / B / C" path for a folder, walking parentFolderId with cycle guard.
function folderPath(state: AppState, folderId: string): string | undefined {
  const folders = state.folders ?? [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
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

function dedupeTasks(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}
