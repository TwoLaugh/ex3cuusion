import { addMinutes, dayOfWeek, daysUntil, maxTime, timeToMinutes } from "./dates";
import type { AppState, DayPlan, LoadLevel, PlanItem, PlanItemStatus, Task } from "./types";

type PlanCandidate = Omit<PlanItem, "startTime" | "endTime"> & {
  fixedStartTime?: string;
  hardAnchor?: boolean;
  preferredWindow?: AppState["routines"][number]["preferredWindow"];
};

function isRoutineDue(recurrence: AppState["routines"][number]["recurrence"], date: string): boolean {
  if (recurrence.type === "daily") return true;
  return recurrence.days.includes(dayOfWeek(date));
}

function isRepeatPolicyDue(task: Task, date: string): boolean {
  if (task.repeatPolicy.type === "none") return true;
  if (task.repeatPolicy.type === "daily") return true;
  return task.repeatPolicy.days?.includes(dayOfWeek(date)) ?? true;
}

function isInCompletionCooldown(task: Task, date: string): boolean {
  if (!task.lastCompletedAt || task.repeatPolicy.type === "none" || !task.repeatPolicy.cooldownDays) return false;
  const completedDate = task.lastCompletedAt.slice(0, 10);
  if (completedDate === date) return false;
  return daysUntil(completedDate, date) < task.repeatPolicy.cooldownDays;
}

function isTaskPlannable(task: Task, date: string): boolean {
  if (task.status === "blocked") return Boolean(task.blocked?.unblockAction);
  if (task.status === "waiting") return Boolean(task.waiting?.followUpDate && daysUntil(date, task.waiting.followUpDate) <= 0);
  const statusAllowsPlanning =
    task.status === "active" ||
    task.status === "scheduled" ||
    (["repeatable", "keep_as_suggestion", "regenerate_after_completion"].includes(task.completionBehavior) && task.status === "completed");
  if (!statusAllowsPlanning) return false;
  if (task.scheduledDate && task.scheduledDate !== date) return false;
  if (!isRepeatPolicyDue(task, date)) return false;
  if (isInCompletionCooldown(task, date)) return false;
  return true;
}

function taskScore(task: Task, date: string): number {
  const dueDistance = daysUntil(date, task.dueDate);
  const dueBoost = dueDistance <= 0 ? 25 : dueDistance <= 2 ? 16 : dueDistance <= 5 ? 8 : 0;
  const strictnessBoost = task.strictness === "strict" ? 8 : task.strictness === "normal" ? 4 : 0;
  const relationshipBoost = task.plannerSignals?.relationshipValue ?? 0;
  const momentumBoost = task.plannerSignals?.momentumValue ?? 0;
  const softPenalty = task.plannerFields.pressureLevel === "soft" ? -8 : 0;
  return task.priority * 4 + task.importance * 3 + task.urgency * 4 + dueBoost + strictnessBoost + relationshipBoost + momentumBoost + softPenalty;
}

function calculateCapacity(state: AppState): number {
  const dayEndMinutes = 22 * 60;
  const remainingToday = Math.max(45, dayEndMinutes - timeToMinutes(state.currentTime));
  const clockAwareAvailable = Math.min(state.availableMinutes, remainingToday);
  const recentDeferrals = state.deferrals.slice(-5);
  const overloadSignals = recentDeferrals.filter((entry) =>
    ["no_time", "overplanned", "low_energy"].includes(entry.reason)
  ).length;

  if (overloadSignals >= 3) return Math.max(90, clockAwareAvailable - 90);
  if (overloadSignals >= 2) return Math.max(120, clockAwareAvailable - 60);
  return clockAwareAvailable;
}

function loadLevel(total: number, available: number): LoadLevel {
  if (total > available) return "overloaded";
  if (total > available * 0.85) return "heavy";
  if (total < available * 0.45) return "light";
  return "normal";
}

export function buildDayPlan(state: AppState): DayPlan {
  const date = state.currentDate;
  const availableMinutes = calculateCapacity(state);
  const items: PlanCandidate[] = [];
  const todayCompletedTaskIdsByPlan = completedTaskIdsByPlan(state, date);
  const todayOutcomePlanIds = new Set(
    state.executionEvents
      .filter((event) => event.date === date && event.planItemId && event.type !== "completed")
      .map((event) => event.planItemId as string)
  );

  for (const routine of state.routines.filter((item) => item.active && isRoutineDue(item.recurrence, date))) {
    items.push({
      id: `plan_${date}_${routine.id}`,
      type: "routine",
      title: routine.title,
      section: "routines",
      status: "planned",
      domainId: routine.domainId,
      routineId: routine.id,
      preferredWindow: routine.preferredWindow,
      estimatedMinutes: routine.defaultEffortMinutes,
      reason: routine.strictness === "strict" ? "Strict routine due today." : "Routine due today."
    });
  }

  const activeTasks = state.tasks.filter((task) => isTaskPlannable(task, date));
  const projectTasks = activeTasks
    .filter((task) => task.projectId && shouldAppearInProjectBlock(state, task))
    .sort((a, b) => taskScore(b, date) - taskScore(a, date));

  const tasksByProject = new Map<string, Task[]>();
  for (const task of projectTasks) {
    const list = tasksByProject.get(task.projectId ?? "") ?? [];
    list.push(task);
    tasksByProject.set(task.projectId ?? "", list);
  }

  for (const [projectId, tasks] of tasksByProject) {
    const project = state.projects.find((item) => item.id === projectId);
    if (!project || project.status !== "active") continue;
    const selected = tasks.slice(0, 3);
    const selectedTaskIds = mergeTaskIds(
      selected.map((task) => task.id),
      todayCompletedTaskIdsByPlan.get(`plan_${date}_${project.id}`) ?? []
    );
    const minutes = Math.min(project.defaultBlockMinutes, selected.reduce((sum, task) => sum + task.effortMinutes, 0));
    items.push({
      id: `plan_${date}_${project.id}`,
      type: "project_block",
      title: project.name,
      section: "main_blocks",
      status: "planned",
      domainId: project.domainId,
      projectId: project.id,
      selectedTaskIds,
      estimatedMinutes: minutes,
      reason: `Selected ${selected.length} high-impact next action${selected.length === 1 ? "" : "s"}.`
    });
  }

  for (const project of settledProjectsForToday(state, date, items)) {
    const taskIds = todayCompletedTaskIdsByPlan.get(`plan_${date}_${project.id}`) ?? settledOutcomeTaskIds(state, date, `plan_${date}_${project.id}`);
    const selectedTasks = state.tasks.filter((task) => taskIds.includes(task.id));
    const minutes = Math.min(
      project.defaultBlockMinutes,
      selectedTasks.reduce((sum, task) => sum + task.effortMinutes, 0) || project.defaultBlockMinutes
    );
    items.push({
      id: `plan_${date}_${project.id}`,
      type: "project_block",
      title: project.name,
      section: "main_blocks",
      status: "planned",
      domainId: project.domainId,
      projectId: project.id,
      selectedTaskIds: taskIds,
      estimatedMinutes: minutes,
      reason: "Kept visible because it was touched today."
    });
  }

  const atomicTasks = activeTasks
    .filter((task) => !task.projectId || !shouldAppearInProjectBlock(state, task))
    .sort((a, b) => taskScore(b, date) - taskScore(a, date));

  for (const task of mergeTasks(atomicTasks, settledAtomicTasksForToday(state, date))) {
    const isRepeatingTask = task.repeatPolicy.type !== "none" && task.completionBehavior !== "keep_as_suggestion";
    const section = isRepeatingTask
      ? "routines"
      : task.completionBehavior === "keep_as_suggestion" || task.strictness === "flexible" || taskScore(task, date) < 25
        ? "soft_invitations"
        : "quick_tasks";
    const fixedStartTime = task.scheduledDate === date ? task.scheduledTime : undefined;
    const hardAnchor = fixedStartTime ? task.strictness === "strict" || /sleep|bed/i.test(task.title) : false;
    const baseCandidate: PlanCandidate = {
      id: `plan_${date}_${task.id}`,
      type: isRepeatingTask ? "routine" : section === "soft_invitations" ? "soft_invitation" : "atomic_task",
      title: task.status === "blocked" && task.blocked?.unblockAction ? `Unblock: ${task.title}` : task.status === "waiting" ? `Follow up: ${task.title}` : task.title,
      section,
      status: "planned",
      domainId: task.domainId,
      taskId: task.id,
      estimatedMinutes: task.effortMinutes,
      clockMinutes: task.effortMinutes,
      blockingMinutes: blockingMinutesForTask(task),
      schedulingMode: task.scheduling?.mode ?? "exclusive",
      attentionLoad: task.scheduling?.attentionLoad ?? "full",
      canOverlap: task.scheduling?.canOverlap ?? false,
      overlapKinds: task.scheduling?.overlapKinds,
      reason: fixedStartTime
        ? hardAnchor
          ? `Fixed anchor at ${fixedStartTime}. Flexible work must fit around it.`
          : `Scheduled for ${fixedStartTime}.`
        : task.status === "blocked" && task.blocked?.unblockAction
          ? `Blocked by ${task.blocked.blockedBy}. Next unblock action: ${task.blocked.unblockAction}.`
          : task.status === "waiting"
            ? `Waiting on ${task.waiting?.waitingOn}. Follow-up is due.`
        : section === "soft_invitations"
          ? task.completionBehavior === "keep_as_suggestion"
            ? "Reusable suggestion if there is spare capacity."
            : "Useful if there is spare capacity."
        : isRepeatingTask
            ? "Repeating task due today."
          : schedulingReason(task) ?? "Small task with time pressure.",
      fixedStartTime,
      hardAnchor
    };
    items.push(...expandPhasedTaskCandidate(baseCandidate, task));
  }

  const completed = new Set(state.completions.filter((event) => event.date === date).map((event) => event.planItemId));
  const deferred = new Set(state.deferrals.filter((event) => event.date === date).map((event) => event.planItemId));
  const scheduledItems = scheduleItems(items, state.currentTime);
  const resolvedItems: PlanItem[] = scheduledItems.map((item) => {
    const status: PlanItemStatus = isItemCompleted(item, completed, todayCompletedTaskIdsByPlan)
      ? "completed"
      : deferred.has(item.id) || todayOutcomePlanIds.has(item.id)
        ? "deferred"
        : item.status === "unscheduled"
          ? "unscheduled"
          : "planned";
    return { ...item, status };
  });
  const estimatedTotalMinutes = resolvedItems
    .filter((item) => item.status === "planned")
    .reduce((sum, item) => sum + (item.blockingMinutes ?? item.estimatedMinutes), 0);

  return {
    date,
    loadLevel: loadLevel(estimatedTotalMinutes, availableMinutes),
    estimatedTotalMinutes,
    availableMinutes,
    summary:
      estimatedTotalMinutes > availableMinutes
        ? "Today is overloaded. Cut soft invitations first."
        : "A focused day built from routines, project momentum, and time-sensitive tasks.",
    items: resolvedItems
  };
}

function completedTaskIdsByPlan(state: AppState, date: string): Map<string, string[]> {
  const byPlan = new Map<string, string[]>();
  for (const event of state.completions.filter((entry) => entry.date === date)) {
    const existing = byPlan.get(event.planItemId) ?? [];
    byPlan.set(event.planItemId, mergeTaskIds(existing, event.taskIds ?? []));
  }
  return byPlan;
}

function settledOutcomeTaskIds(state: AppState, date: string, planItemId: string): string[] {
  return mergeTaskIds(
    [],
    state.executionEvents
      .filter((event) => event.date === date && event.planItemId === planItemId)
      .flatMap((event) => event.taskIds ?? (event.taskId ? [event.taskId] : []))
  );
}

function settledProjectsForToday(state: AppState, date: string, existingItems: PlanCandidate[]): AppState["projects"] {
  const existingProjectIds = new Set(existingItems.flatMap((item) => (item.projectId ? [item.projectId] : [])));
  const settledPlanIds = new Set([
    ...state.completions.filter((event) => event.date === date).map((event) => event.planItemId),
    ...state.executionEvents.filter((event) => event.date === date && event.planItemId).map((event) => event.planItemId as string)
  ]);
  return state.projects.filter((project) => settledPlanIds.has(`plan_${date}_${project.id}`) && !existingProjectIds.has(project.id));
}

function settledAtomicTasksForToday(state: AppState, date: string): Task[] {
  const settledPlanIds = new Set([
    ...state.completions.filter((event) => event.date === date).map((event) => event.planItemId),
    ...state.executionEvents.filter((event) => event.date === date && event.planItemId).map((event) => event.planItemId as string)
  ]);
  return state.tasks.filter((task) => settledPlanIds.has(`plan_${date}_${task.id}`));
}

function mergeTasks(primary: Task[], secondary: Task[]): Task[] {
  const seen = new Set<string>();
  const merged: Task[] = [];
  for (const task of [...primary, ...secondary]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }
  return merged;
}

function mergeTaskIds(primary: string[], secondary: string[]): string[] {
  return [...primary, ...secondary].filter((taskId, index, all) => all.indexOf(taskId) === index);
}

function isItemCompleted(item: PlanItem, completed: Set<string>, completedTaskIdsByPlanMap: Map<string, string[]>): boolean {
  if (!completed.has(item.id)) return false;
  if (item.type !== "project_block") return true;
  const selectedTaskIds = item.selectedTaskIds ?? [];
  if (!selectedTaskIds.length) return true;
  const completedTaskIds = new Set(completedTaskIdsByPlanMap.get(item.id) ?? []);
  return selectedTaskIds.every((taskId) => completedTaskIds.has(taskId));
}

function shouldAppearInProjectBlock(state: AppState, task: Task): boolean {
  if (!task.projectId) return false;
  const project = state.projects.find((item) => item.id === task.projectId);
  if (!project) return false;
  if (task.completionBehavior === "keep_as_suggestion") return false;
  return !["suggestion_pool", "relationship"].includes(project.planningMode);
}

function scheduleItems(items: PlanCandidate[], currentTime: string): PlanItem[] {
  const fixed = items
    .filter((item) => item.fixedStartTime)
    .sort((a, b) => timeToMinutes(a.fixedStartTime ?? "00:00") - timeToMinutes(b.fixedStartTime ?? "00:00"));
  const morningRoutines = items.filter((item) => item.section === "routines" && item.preferredWindow === "morning");
  const afternoonRoutines = items.filter((item) => item.section === "routines" && item.preferredWindow === "afternoon");
  const eveningRoutines = items.filter((item) => item.section === "routines" && item.preferredWindow === "evening");
  const unspecificRoutines = items.filter((item) => item.section === "routines" && !item.preferredWindow);
  const flexible = uniqueCandidates([
    ...morningRoutines,
    ...unspecificRoutines,
    ...items.filter((item) => item.section === "main_blocks"),
    ...afternoonRoutines,
    ...items.filter((item) => item.section === "quick_tasks"),
    ...items.filter((item) => item.attentionLoad === "passive" && item.canOverlap),
    ...eveningRoutines,
    ...items.filter((item) => item.section === "soft_invitations" && !(item.attentionLoad === "passive" && item.canOverlap)),
    ...items.filter((item) => item.section === "later")
  ]).filter((item) => !item.fixedStartTime);

  const scheduled: PlanItem[] = [];
  const unscheduled: PlanItem[] = [];
  const remainingFlexible = [...flexible];
  const sleepAnchor = fixed.find((item) => item.hardAnchor && /sleep|bed/i.test(item.title));
  const hasSleepAnchor = Boolean(sleepAnchor);

  let cursor = maxTime(currentTime, "08:30");

  for (const anchor of fixed) {
    const anchorStart = anchor.fixedStartTime ?? cursor;
    const anchorEnd = addMinutes(anchorStart, anchor.estimatedMinutes);

    if (timeToMinutes(anchorStart) > timeToMinutes(cursor)) {
      while (remainingFlexible.length > 0) {
        const fitIndex = remainingFlexible.findIndex((item) => fitsBefore(item, cursor, anchorStart));
        if (fitIndex === -1) break;
        const [item] = remainingFlexible.splice(fitIndex, 1);
        const scheduledItem = scheduleFlexibleItem(item, cursor);
        scheduled.push(scheduledItem);
        cursor = maxTime(cursor, nextCursor(scheduledItem));
      }
    }

    scheduled.push({
      ...anchor,
      status: "planned",
      startTime: anchorStart,
      endTime: anchorEnd
    });
    cursor = maxTime(cursor, nextCursor(scheduled[scheduled.length - 1]));
  }

  if (!hasSleepAnchor) {
    while (remainingFlexible.length > 0) {
      const [item] = remainingFlexible.splice(0, 1);
      const scheduledItem = scheduleFlexibleItem(item, overlapStartFor(item, scheduled) ?? cursor);
      scheduled.push(scheduledItem);
      cursor = maxTime(cursor, nextCursor(scheduledItem));
    }
  }

  unscheduled.push(
    ...remainingFlexible.map((item) => ({
      ...item,
      status: "unscheduled" as const,
      startTime: "Later",
      endTime: "No room",
      section: "later" as const,
      reason: hasSleepAnchor
        ? `Does not fit before ${sleepAnchor?.title} at ${sleepAnchor?.fixedStartTime}. Review, shorten, or defer it.`
        : "No remaining planning space today. Review, shorten, or defer it."
    }))
  );

  return [...scheduled, ...unscheduled].sort((a, b) => sortTime(a.startTime) - sortTime(b.startTime));
}

function fitsBefore(item: PlanCandidate, cursor: string, anchorStart: string): boolean {
  return timeToMinutes(cursor) + (item.blockingMinutes ?? item.estimatedMinutes) <= timeToMinutes(anchorStart);
}

function scheduleFlexibleItem(item: PlanCandidate, cursor: string): PlanItem {
  const startTime = cursor;
  return {
    ...item,
    status: "planned",
    startTime,
    endTime: addMinutes(startTime, item.clockMinutes ?? item.estimatedMinutes)
  };
}

function uniqueCandidates(items: PlanCandidate[]): PlanCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function overlapStartFor(item: PlanCandidate, scheduled: PlanItem[]): string | undefined {
  if (item.attentionLoad !== "passive" || !item.canOverlap) return undefined;
  const previous = [...scheduled].reverse().find((candidate) => candidate.status === "planned" && isCompatibleOverlap(item, candidate));
  return previous?.startTime;
}

function isCompatibleOverlap(item: PlanCandidate, candidate: PlanItem): boolean {
  if (!candidate.canOverlap && candidate.attentionLoad === "full") return false;
  if (item.attentionLoad === "passive" && candidate.attentionLoad === "partial") return true;
  const itemKinds = new Set(item.overlapKinds ?? []);
  const candidateKinds = candidate.overlapKinds ?? [];
  if (!itemKinds.size || !candidateKinds.length) return true;
  return candidateKinds.some((kind) => itemKinds.has(kind));
}

function nextCursor(item: PlanItem): string {
  const blockingMinutes = item.blockingMinutes ?? item.estimatedMinutes;
  if (item.phaseKind === "passive") return addMinutes(item.startTime, item.clockMinutes ?? item.estimatedMinutes);
  if (blockingMinutes <= 0) return item.startTime;
  if (item.attentionLoad === "partial" && item.canOverlap) return item.endTime;
  return addMinutes(item.startTime, blockingMinutes + (blockingMinutes >= 60 ? 20 : 10));
}


function sortTime(time: string): number {
  if (time === "Later") return Number.POSITIVE_INFINITY;
  return timeToMinutes(time);
}

function blockingMinutesForTask(task: Task): number {
  if (!task.scheduling) return task.effortMinutes;
  if (task.scheduling.attentionLoad === "passive") return 0;
  if (task.scheduling.attentionLoad === "partial") return Math.max(5, Math.round(task.effortMinutes * 0.45));
  return task.effortMinutes;
}

function expandPhasedTaskCandidate(base: PlanCandidate, task: Task): PlanCandidate[] {
  if (task.scheduling?.mode !== "phased" || !task.scheduling.phases?.length) return [base];
  let runningOffset = 0;
  return task.scheduling.phases.map((phase, index) => {
    const phaseOffset = phase.offsetMinutes ?? runningOffset;
    runningOffset = phaseOffset + phase.effortMinutes;
    return {
      ...base,
      id: `${base.id}_phase_${index + 1}`,
      title: phase.title,
      estimatedMinutes: phase.effortMinutes,
      clockMinutes: phase.effortMinutes,
      blockingMinutes: phase.attentionLoad === "passive" ? 0 : phase.attentionLoad === "partial" ? Math.max(5, Math.round(phase.effortMinutes * 0.45)) : phase.effortMinutes,
      schedulingMode: "phased",
      attentionLoad: phase.attentionLoad,
      canOverlap: phase.canOverlap ?? phase.attentionLoad !== "full",
      overlapKinds: phase.overlapKinds ?? task.scheduling?.overlapKinds,
      phaseKind: phase.kind,
      phaseIndex: index,
      parentTaskId: task.id,
      reason:
        phase.kind === "passive"
          ? `${task.title}: passive phase can run while compatible work continues.`
          : phase.kind === "return"
            ? `${task.title}: return point after the background phase.`
            : `${task.title}: active phase ${index + 1}.`,
      fixedStartTime: base.fixedStartTime ? addMinutes(base.fixedStartTime, phaseOffset) : undefined,
      hardAnchor: base.hardAnchor && phase.attentionLoad === "full"
    };
  });
}

function schedulingReason(task: Task): string | undefined {
  if (!task.scheduling || task.scheduling.mode === "exclusive") return undefined;
  if (task.scheduling.mode === "background") return "Background work: visible on the timeline but does not consume full attention.";
  if (task.scheduling.mode === "concurrent") return "Concurrent work: can share time with compatible low-conflict tasks.";
  if (task.scheduling.mode === "phased") return "Phased work: active and passive phases are planned separately.";
  return undefined;
}
