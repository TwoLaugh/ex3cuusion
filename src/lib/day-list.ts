// T092: list-first Today. The day's commitment is the user's hand-authored LIST (DayList in
// state.dayLists), not a generated schedule — the system ADVISES the list (tray, gauges, habit
// strip) instead of authoring the day. Everything here is a pure function over AppState:
// buildMorningList constructs the day's starting list, renderDayList produces the read model the
// Today surface consumes. state.ts owns when lists are created and mutated (ensureDayList +
// explicit, undoable list mutations), mirroring the T090 committed-plan split with day-view.ts.
import { addDays, daysUntil, timeToMinutes } from "./dates";
import { stateTimestamp } from "./day-view";
import { calculateCapacity, effectiveEffortMinutes, hasActiveChildren, isRepeatPolicyDue, isTaskPlannable, taskScore } from "./planner";
import type { AppState, DayList, DayListEntry, DayListSource, Energy, Folder, Task, TraySignal } from "./types";

// Sources that represent user intent and therefore carry over to the next day when unfinished.
// "recurring" entries do NOT carry — the next morning build re-adds them if they are due again.
const CARRIED_SOURCES: ReadonlySet<DayListSource> = new Set(["manual", "tray", "ai", "carried"]);

const MAX_STREAK_WALK_DAYS = 365;
const TRAY_BACKLOG_LIMIT = 5;
const TRAY_BALANCE_LIMIT = 3;

// T093 intelligent tray. HARD constraints (product-definition): acceptance learning may DAMPEN a
// task but never suppress it to zero — any active non-habit task unsurfaced for TRAY_FLOOR_DAYS
// gets a guaranteed backlog slot — and aging escalates to a QUESTION (staleQuestion), never an
// automatic archive.
const TRAY_FLOOR_DAYS = 7; // guaranteed minimum resurfacing frequency for active tasks
const STALE_QUESTION_STREAK = 5; // ignored surfacings before the tray asks someday/keep
const SOMEDAY_RESURFACE_INTERVALS = [7, 14, 30, 90]; // spaced someday schedule, indexed by surfacedCount
const END_OF_EVENING = "22:30"; // gap anchor when no pinned entry remains today
// T110: for a FUTURE (plan-ahead) date no clock has elapsed, so gaps/pins are measured from a
// nominal day start rather than the current time — the whole day is available.
const DAY_START_MINUTES = 8 * 60;
// TMT delay anchor for undated tasks: an undated task starts with a synthetic ~3-week horizon
// that shrinks as it ages in the tray, so older backlog discounts less and rises.
const UNDATED_DELAY_HORIZON_DAYS = 21;

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
  // T093 (additive): the calibrated effort fits the gap before the next pinned anchor.
  fitsGap: boolean;
  // T093 (additive): big (>= 90m) AND vague (no definitionOfDone) — suggest splitting it.
  suggestSplit: boolean;
  // T093 (additive): ignored on >= 5 distinct days — ask someday/keep instead of dropping it.
  staleQuestion: boolean;
  // T093 (additive): a someday task brought back by the spaced 7/14/30/90 schedule.
  resurfaced: boolean;
  // T093 (additive): the folder's actual/estimate calibration ratio when it differs from 1.0.
  calibrationRatio?: number;
  // T093 (additive): number of blocked subtasks this (parent) task would free up.
  unblocks?: number;
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
  // T093 (additive): listMinutes re-estimated through per-folder actual/estimate ratios.
  calibratedListMinutes: number;
  // Pillar mix (top-ancestor folder) of list + habit tasks, completed included.
  balance: DayListPillarShare[];
  missingPillars: string[];
}

export interface DayListView {
  date: string;
  committedAt: string;
  entries: DayListEntryView[];
  habits: DayListHabitView[];
  // T093 (additive): gapMinutes = minutes until the next upcoming pinned anchor (else ~22:30).
  tray: { due: DayListTrayTask[]; balance: DayListTrayTask[]; backlog: DayListTrayTask[]; gapMinutes: number };
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

  // T110: a list built for a date beyond today is an evening plan-ahead; it is reconciled (not
  // rebuilt) on the morning it becomes the live day.
  return { date, committedAt: stateTimestamp(state), entries, plannedAhead: date > state.currentDate };
}

// T110: reconcile a plan-ahead list on the first view of the day it belongs to. AUTHORED ORDER is
// sacred: surviving entries keep their position and any pins the user set while planning. Only two
// changes are applied — (1) DROP entries that went stale overnight (the task was completed late the
// prior evening, archived, or re-dated to another day), and (2) APPEND, at the end, the entries a
// fresh morning build now requires (recurring that became due, and carryover that became unfinished)
// which are not already present. A due-recurring the user deliberately removed while planning WILL
// reappear — the same as an ordinary morning build, and it stays one tap away in the tray. The flag
// is cleared so the reconcile runs exactly once.
export function reconcileDayList(state: AppState, list: DayList): void {
  const date = list.date;
  const survivors = list.entries.filter((entry) => {
    const task = state.tasks.find((candidate) => candidate.id === entry.taskId);
    if (!task || task.habit || task.status === "archived") return false;
    if (task.status === "completed") return false; // one-shot finished late the prior evening
    return isTaskPlannable(task, date); // re-dated away / no longer plannable → drop
  });
  const survivorIds = new Set(survivors.map((entry) => entry.taskId));
  const additions = buildMorningList(state, date).entries.filter((entry) => !survivorIds.has(entry.taskId));
  list.entries = [...survivors, ...additions].map((entry, index) => ({ ...entry, order: index }));
  list.plannedAhead = false;
}

// The read model the Today surface consumes: the list (sorted by order — pins are display
// metadata, not a sort key), the habit strip with streaks, the tray (due / balance / backlog),
// and the capacity + pillar-balance gauges.
export function renderDayList(state: AppState, list: DayList): DayListView {
  const date = list.date;
  // T110: on a plan-ahead date "now" is the start of that day, not the current clock (which belongs
  // to today). missedPin already keys off `date === state.currentDate`, so future pins never miss.
  const isFuture = date > state.currentDate;
  const nowMinutes = isFuture ? DAY_START_MINUTES : timeToMinutes(state.currentTime);
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

  // T093 gap-aware: minutes until the next upcoming, unticked pinned anchor (else end of evening).
  const upcomingPinMinutes = list.entries.flatMap((entry) => {
    if (!entry.pinnedTime || timeToMinutes(entry.pinnedTime) <= nowMinutes) return [];
    const task = taskById.get(entry.taskId);
    if (!task || taskCompletedOnDate(state, task, date)) return []; // a done anchor no longer bounds the gap
    return [timeToMinutes(entry.pinnedTime)];
  });
  const gapMinutes = Math.max(0, (upcomingPinMinutes.length ? Math.min(...upcomingPinMinutes) : timeToMinutes(END_OF_EVENING)) - nowMinutes);

  // T093 unblocker-first (LIMITED): there is no structural dependency model between tasks — the
  // only dependency-like edge is parentTaskId. The one detectable "completing this frees work"
  // shape is a parent whose live subtasks are ALL blocked: the normal candidate filter hides it
  // (hasActiveChildren) and its blocked children may themselves be unplannable, so the parent
  // would otherwise be invisible everywhere. Surface it with an `unblocks` count. Cross-task
  // dependencies ("X blocks unrelated Y") are not representable in the model yet.
  const blockedChildCounts = new Map<string, number>();
  const parentsWithLiveUnblockedChild = new Set<string>();
  for (const task of state.tasks) {
    if (!task.parentTaskId || task.status === "archived" || task.status === "completed") continue;
    if (task.status === "blocked") blockedChildCounts.set(task.parentTaskId, (blockedChildCounts.get(task.parentTaskId) ?? 0) + 1);
    else parentsWithLiveUnblockedChild.add(task.parentTaskId);
  }
  const unblockerParents = state.tasks.filter(
    (task) =>
      blockedChildCounts.has(task.id) &&
      !parentsWithLiveUnblockedChild.has(task.id) &&
      !task.habit &&
      !listTaskIds.has(task.id) &&
      task.completionBehavior !== "keep_as_suggestion" &&
      task.type !== "soft_invitation" &&
      isTaskPlannable(task, date) &&
      !taskCompletedOnDate(state, task, date)
  );

  // T093 backlog: TMT-ranked, acceptance-damped, floor-guaranteed selection (replaces the plain
  // taskScore sort). Someday tasks are excluded except on their spaced resurfacing schedule.
  const rankContext: BacklogRankContext = {
    gapMinutes,
    avoidanceActive: avoidancePatternActive(state, date, trayCandidates),
    highEnergyLowYield: isLowYieldHourForHighEnergy(state)
  };
  const backlogPool = [
    ...trayCandidates
      .filter((task) => !dueIds.has(task.id) && task.completionBehavior !== "keep_as_suggestion" && task.type !== "soft_invitation")
      .map((task) => ({ task, unblocks: undefined as number | undefined })),
    ...unblockerParents.map((task) => ({ task, unblocks: blockedChildCounts.get(task.id) }))
  ].flatMap(({ task, unblocks }) => {
    const someday = somedaySchedule(state, task, date);
    if (someday.excluded) return [];
    return [
      {
        task,
        unblocks,
        resurfaced: someday.resurfaced,
        rank: backlogRank(state, task, date, { ...rankContext, unblocks })
      }
    ];
  });
  const backlogRows = selectBacklog(state, date, backlogPool);

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

  // T093 telemetry: every task the tray shows today is recorded as surfaced (idempotent per date
  // — repeated same-day reads change nothing). Mutating signals on read matches the repository's
  // persist-on-read pattern. T110: a future plan-ahead preview does NOT record surfacing — that
  // telemetry belongs to the live day, and reconcile re-renders it as today when it arrives.
  if (!isFuture) {
    recordTraySurfacing(state, date, [
      ...due.map((task) => task.id),
      ...balanceTray.map(({ task }) => task.id),
      ...backlogRows.map((row) => row.task.id)
    ]);
  }

  // T093 calibrated capacity: per-folder actual/estimate ratios re-price the remaining list.
  const calibration = buildTrayCalibration(state);
  const uncompletedEntries = entries.filter((entry) => !entry.completedToday);
  const listMinutes = uncompletedEntries.reduce((sum, entry) => sum + entry.effortMinutes, 0);
  const calibratedListMinutes = Math.round(
    uncompletedEntries.reduce((sum, entry) => sum + entry.effortMinutes * calibration.ratioFor(taskById.get(entry.taskId)?.folderId), 0)
  );
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
      due: due.map((task) => trayTaskView(state, task, { gapMinutes, calibration })),
      balance: balanceTray.map(({ task, pillar }) => trayTaskView(state, task, { gapMinutes, calibration, pillarName: pillar?.name })),
      backlog: backlogRows.map((row) =>
        trayTaskView(state, row.task, { gapMinutes, calibration, resurfaced: row.resurfaced, unblocks: row.unblocks })
      ),
      gapMinutes
    },
    gauges: {
      capacityMinutes: calculateCapacity(state, date),
      listMinutes,
      calibratedListMinutes,
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

// --- T093 intelligent-tray machinery ------------------------------------------------------------

export function findTraySignal(state: AppState, taskId: string): TraySignal | undefined {
  return (state.traySignals ?? []).find((signal) => signal.taskId === taskId);
}

export function ensureTraySignal(state: AppState, taskId: string): TraySignal {
  state.traySignals ??= [];
  let signal = findTraySignal(state, taskId);
  if (!signal) {
    signal = { taskId, surfacedCount: 0, addedCount: 0, ignoredStreak: 0 };
    state.traySignals.push(signal);
  }
  return signal;
}

// Surfacing update, idempotent per date: a task already stamped with today's date is skipped, so
// repeated same-day reads never grow counts. ignoredStreak/lastOutcome are PROVISIONAL — an add
// or eject (state.ts) overwrites them the moment the user acts.
function recordTraySurfacing(state: AppState, date: string, taskIds: string[]): void {
  for (const taskId of new Set(taskIds)) {
    const signal = ensureTraySignal(state, taskId);
    if (signal.lastSurfacedDate === date) continue;
    signal.surfacedCount += 1;
    signal.firstSurfacedDate ??= date;
    signal.lastSurfacedDate = date;
    signal.ignoredStreak += 1;
    signal.lastOutcome = "ignored";
  }
}

type Clarity = "high" | "medium" | "low";

// Expectancy proxy: a written definition of done or a small bite is "I know how to finish this";
// big AND vague is the classic stall shape (low expectancy + split suggestion).
function clarityLevel(task: Task): Clarity {
  if (task.definitionOfDone || task.effortMinutes <= 30) return "high";
  if (task.effortMinutes >= 90) return "low";
  return "medium";
}

interface BacklogRankContext {
  gapMinutes: number;
  avoidanceActive: boolean;
  highEnergyLowYield: boolean;
  unblocks?: number;
}

// T093 TMT scoring for the tray backlog ONLY (planner taskScore is untouched):
//   rank = (value × expectancy) / delay-discount × damping × folderPropensity
//          × gapFit × energyFit × avoidanceBoost × unblockerBoost
// value = taskScore + 2×pillar weight; expectancy from clarityLevel (1.2 / 1.0 / 0.7);
// delay = days to a future dueDate, else max(0, 21 − tray age). The delay anchor for undated
// tasks is the signal's firstSurfacedDate because Task has no createdAt — a task the tray has
// never shown reads as age 0 (full synthetic horizon) and rises as it waits.
function backlogRank(state: AppState, task: Task, date: string, context: BacklogRankContext): number {
  const pillarWeight = topAncestorFolder(state, task.folderId)?.weight ?? 5;
  const value = Math.max(1, taskScore(state, task, date) + 2 * pillarWeight);
  const clarity = clarityLevel(task);
  const expectancy = clarity === "high" ? 1.2 : clarity === "low" ? 0.7 : 1;
  const signal = findTraySignal(state, task.id);
  const trayAgeDays = signal?.firstSurfacedDate ? Math.max(0, daysUntil(signal.firstSurfacedDate, date)) : 0;
  const delayDays =
    task.dueDate && task.dueDate > date ? daysUntil(date, task.dueDate) : Math.max(0, UNDATED_DELAY_HORIZON_DAYS - trayAgeDays);
  const delayDiscount = 1 + delayDays / 14;
  // Acceptance damping (floor-guarded in selectBacklog): 5 ignored surfacings → ×0.4, never 0.
  const damping = 1 / (1 + 0.3 * Math.min(signal?.ignoredStreak ?? 0, STALE_QUESTION_STREAK));
  const propensity = folderPropensityMultiplier(state, task.folderId);
  const gapFit = effectiveEffortMinutes(state, task) <= context.gapMinutes ? 1.15 : 1;
  const energyFit = task.energy === "high" && context.highEnergyLowYield ? 0.8 : 1;
  const avoidanceBoost = context.avoidanceActive && clarity === "high" && task.effortMinutes <= 30 ? 1.5 : 1;
  const unblockerBoost = 1 + 0.15 * Math.min(context.unblocks ?? 0, 3);
  return ((value * expectancy) / delayDiscount) * damping * propensity * gapFit * energyFit * avoidanceBoost * unblockerBoost;
}

// Gentle folder propensity: mean add-rate (addedCount/surfacedCount, capped at 1) across the
// folder's surfaced tasks, mapped to ×0.8 (never added) .. ×1.2 (always added). No data → ×1.0.
function folderPropensityMultiplier(state: AppState, folderId: string | undefined): number {
  if (!folderId) return 1;
  const rates = state.tasks
    .filter((task) => task.folderId === folderId)
    .map((task) => findTraySignal(state, task.id))
    .filter((signal): signal is TraySignal => Boolean(signal && signal.surfacedCount > 0))
    .map((signal) => Math.min(1, signal.addedCount / signal.surfacedCount));
  if (!rates.length) return 1;
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  return Math.max(0.8, Math.min(1.2, 0.8 + 0.4 * mean));
}

// Avoidance signal: the last 3 days' completions are predominantly tiny (<= 15m) while at least
// one >= 60m candidate sat untouched — boost small CLEAR tasks (in backlogRank) to rebuild
// momentum instead of pretending the big one will suddenly happen.
function avoidancePatternActive(state: AppState, date: string, candidates: Task[]): boolean {
  const windowStart = addDays(date, -2);
  const completedTasks: Task[] = [];
  const completedIds = new Set<string>();
  for (const event of state.completions) {
    if (event.date < windowStart || event.date > date) continue;
    for (const taskId of event.taskIds ?? []) {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (!task) continue;
      completedTasks.push(task);
      completedIds.add(task.id);
    }
  }
  if (completedTasks.length < 3) return false;
  const smallShare = completedTasks.filter((task) => task.effortMinutes <= 15).length / completedTasks.length;
  if (smallShare < 0.7) return false;
  return candidates.some((task) => task.effortMinutes >= 60 && !completedIds.has(task.id));
}

// Energy/time-of-day matching. CompletionEvent carries no clock time, so the hour histogram is
// built from "completed" executionEvents' createdAt (state.ts writes one per completion). Cold
// start: fewer than 10 attributable completions → no-op. "Low-yield" = the current hour holds
// less than half the average per-observed-hour count of high-energy completions.
function isLowYieldHourForHighEnergy(state: AppState): boolean {
  const samples: Array<{ energy: Energy; hour: number }> = [];
  for (const event of state.executionEvents) {
    if (event.type !== "completed" || !event.createdAt) continue;
    const hour = Number.parseInt(event.createdAt.slice(11, 13), 10);
    if (Number.isNaN(hour)) continue;
    for (const taskId of event.taskIds ?? (event.taskId ? [event.taskId] : [])) {
      const task = state.tasks.find((candidate) => candidate.id === taskId);
      if (task) samples.push({ energy: task.energy, hour });
    }
  }
  if (samples.length < 10) return false;
  const high = samples.filter((sample) => sample.energy === "high");
  if (!high.length) return false;
  const observedHours = new Set(high.map((sample) => sample.hour));
  const meanPerHour = high.length / observedHours.size;
  const currentHour = Number.parseInt(state.currentTime.slice(0, 2), 10);
  const atCurrentHour = high.filter((sample) => sample.hour === currentHour).length;
  return atCurrentHour < meanPerHour * 0.5;
}

// Spaced someday resurfacing: dateIntent "someday" tasks stay out of the backlog except on the
// 7/14/30/90-day schedule after lastSurfacedDate (interval index = surfacedCount, so each
// resurfacing widens the gap; resolveStaleTask resets the count to restart at 7). A someday task
// with no surfacing anchor surfaces once immediately to start the clock — never suppressed to
// zero. A task already surfaced today stays for the day (idempotent re-reads) unless the user
// just resolved it (lastOutcome cleared).
function somedaySchedule(state: AppState, task: Task, date: string): { excluded: boolean; resurfaced: boolean } {
  if (task.dateIntent?.kind !== "someday") return { excluded: false, resurfaced: false };
  const signal = findTraySignal(state, task.id);
  if (!signal?.lastSurfacedDate) return { excluded: false, resurfaced: true };
  if (signal.lastSurfacedDate === date) {
    return signal.lastOutcome === "ignored" ? { excluded: false, resurfaced: true } : { excluded: true, resurfaced: false };
  }
  const interval = SOMEDAY_RESURFACE_INTERVALS[Math.min(signal.surfacedCount, SOMEDAY_RESURFACE_INTERVALS.length - 1)];
  return daysUntil(signal.lastSurfacedDate, date) >= interval ? { excluded: false, resurfaced: true } : { excluded: true, resurfaced: false };
}

interface BacklogRow {
  task: Task;
  rank: number;
  resurfaced: boolean;
  unblocks?: number;
}

// Backlog selection with the HARD floor. Rank order decides, EXCEPT:
//   - sticky-for-the-day: tasks already surfaced today and not yet acted on are re-included, so
//     repeated same-day reads are stable and signals stay idempotent;
//   - floor (first read of a date): if the tray is full and no selected task is floor-due
//     (unsurfaced >= 7 days, incl. never surfaced), the lowest-ranked slot is given to the most
//     stale floor-due task — damping can NEVER exclude a floor-due task.
function selectBacklog(state: AppState, date: string, pool: BacklogRow[]): BacklogRow[] {
  const staleness = (row: BacklogRow): number => {
    const signal = findTraySignal(state, row.task.id);
    return signal?.lastSurfacedDate ? daysUntil(signal.lastSurfacedDate, date) : Number.MAX_SAFE_INTEGER;
  };
  const isFloorDue = (row: BacklogRow): boolean => staleness(row) >= TRAY_FLOOR_DAYS;
  const isSticky = (row: BacklogRow): boolean => {
    const signal = findTraySignal(state, row.task.id);
    return signal?.lastSurfacedDate === date && signal.lastOutcome === "ignored";
  };

  const ranked = [...pool].sort((a, b) => b.rank - a.rank || a.task.id.localeCompare(b.task.id));
  const sticky = ranked.filter(isSticky);
  const rest = ranked.filter((row) => !isSticky(row));
  let selected = [...sticky, ...rest].slice(0, TRAY_BACKLOG_LIMIT);

  if (!sticky.length && selected.length === TRAY_BACKLOG_LIMIT && !selected.some(isFloorDue)) {
    const floorPick = ranked
      .filter((row) => !selected.includes(row) && isFloorDue(row))
      .sort(
        (a, b) =>
          staleness(b) - staleness(a) ||
          (findTraySignal(state, a.task.id)?.surfacedCount ?? 0) - (findTraySignal(state, b.task.id)?.surfacedCount ?? 0) ||
          a.task.id.localeCompare(b.task.id)
      )[0];
    if (floorPick) selected = [...selected.slice(0, TRAY_BACKLOG_LIMIT - 1), floorPick];
  }

  return selected.sort((a, b) => b.rank - a.rank || a.task.id.localeCompare(b.task.id));
}

interface TrayCalibration {
  ratioFor(folderId: string | undefined): number;
}

// Calibrated capacity: actual/estimate ratio per folder from single-task completions that carry
// actualMinutes (a block completion's minutes cannot be attributed to one task). A folder needs
// >= 3 samples; fallback is the global ratio (>= 3 samples), then 1.0. Clamped 0.5..2.5.
function buildTrayCalibration(state: AppState): TrayCalibration {
  const samplesByFolder = new Map<string, number[]>();
  const allSamples: number[] = [];
  for (const event of state.completions) {
    if (typeof event.actualMinutes !== "number" || event.actualMinutes <= 0) continue;
    if (event.taskIds?.length !== 1) continue;
    const task = state.tasks.find((candidate) => candidate.id === event.taskIds![0]);
    if (!task || task.effortMinutes <= 0) continue;
    const ratio = event.actualMinutes / task.effortMinutes;
    allSamples.push(ratio);
    const key = task.folderId ?? "";
    samplesByFolder.set(key, [...(samplesByFolder.get(key) ?? []), ratio]);
  }
  const clampRatio = (value: number): number => Math.max(0.5, Math.min(2.5, value));
  const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const globalRatio = allSamples.length >= 3 ? clampRatio(mean(allSamples)) : undefined;
  const folderRatios = new Map<string, number>();
  for (const [key, samples] of samplesByFolder) {
    if (samples.length >= 3) folderRatios.set(key, clampRatio(mean(samples)));
  }
  return { ratioFor: (folderId) => folderRatios.get(folderId ?? "") ?? globalRatio ?? 1 };
}

interface TrayTaskViewOptions {
  gapMinutes: number;
  calibration: TrayCalibration;
  pillarName?: string;
  resurfaced?: boolean;
  unblocks?: number;
}

function trayTaskView(state: AppState, task: Task, options: TrayTaskViewOptions): DayListTrayTask {
  const signal = findTraySignal(state, task.id);
  const ratio = options.calibration.ratioFor(task.folderId);
  return {
    taskId: task.id,
    title: task.title,
    folderId: task.folderId,
    folderPath: task.folderId ? folderPath(state, task.folderId) : undefined,
    effortMinutes: task.effortMinutes,
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    pillarName: options.pillarName,
    fitsGap: effectiveEffortMinutes(state, task) <= options.gapMinutes,
    suggestSplit: clarityLevel(task) === "low",
    staleQuestion: (signal?.ignoredStreak ?? 0) >= STALE_QUESTION_STREAK,
    resurfaced: options.resurfaced ?? false,
    calibrationRatio: ratio !== 1 ? Math.round(ratio * 100) / 100 : undefined,
    unblocks: options.unblocks
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
