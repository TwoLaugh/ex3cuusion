import { addDays, isDateInRange, nextWeekRange, weekRange } from "./dates";
import { buildDayPlan, hasActiveChildren } from "./planner";
import type { AppState, DateIntent, Task, WeekBacklogItem, WeekPlan } from "./types";

export function buildWeekPlan(state: AppState): WeekPlan {
  const currentWeek = weekRange(state.currentDate);
  const nextWeek = nextWeekRange(state.currentDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(currentWeek.startDate, index);
    return {
      date,
      plan: buildDayPlan({
        ...state,
        currentDate: date,
        currentTime: date === state.currentDate ? state.currentTime : "08:30"
      })
    };
  });

  return {
    startDate: currentWeek.startDate,
    endDate: currentWeek.endDate,
    days,
    thisWeekBacklog: weekBacklog(state, currentWeek.startDate, currentWeek.endDate),
    nextWeekBacklog: weekBacklog(state, nextWeek.startDate, nextWeek.endDate),
    someday: state.tasks
      .filter(isOpenTask)
      .filter((task) => !hasActiveChildren(state, task.id))
      .filter((task) => effectiveDateIntent(task).kind === "someday")
      .map(toBacklogItem)
  };
}

function weekBacklog(state: AppState, startDate: string, endDate: string): WeekBacklogItem[] {
  return state.tasks
    .filter(isOpenTask)
    .filter((task) => !hasActiveChildren(state, task.id))
    .filter((task) => isTaskInWeekBacklog(task, startDate, endDate))
    .sort((a, b) => (b.priority + b.importance + b.urgency) - (a.priority + a.importance + a.urgency))
    .map(toBacklogItem);
}

function isTaskInWeekBacklog(task: Task, startDate: string, endDate: string): boolean {
  const intent = effectiveDateIntent(task);
  if (isDateInRange(task.scheduledDate, startDate, endDate)) return false;
  if (intent.kind === "week_window") {
    return rangesOverlap(intent.startDate, intent.endDate, startDate, endDate);
  }
  if (intent.kind === "deadline") return isDateInRange(intent.dueDate ?? task.dueDate, startDate, endDate);
  return isDateInRange(task.dueDate, startDate, endDate);
}

function effectiveDateIntent(task: Task): DateIntent {
  if (task.dateIntent) return task.dateIntent;
  if (task.scheduledDate) {
    return { kind: "specific_date", scheduledDate: task.scheduledDate, confidence: 0.5 };
  }
  if (task.dueDate) {
    return { kind: "deadline", dueDate: task.dueDate, confidence: 0.5 };
  }
  if (task.repeatPolicy.type !== "none") {
    return { kind: "recurring", confidence: 0.5 };
  }
  if (task.plannerFields.pressureLevel === "someday") {
    return { kind: "someday", confidence: 0.45 };
  }
  return { kind: "none", confidence: 0.3 };
}

function rangesOverlap(leftStart: string | undefined, leftEnd: string | undefined, rightStart: string, rightEnd: string): boolean {
  if (!leftStart || !leftEnd) return false;
  return leftStart <= rightEnd && leftEnd >= rightStart;
}

function isOpenTask(task: Task): boolean {
  return !["completed", "archived"].includes(task.status);
}

function toBacklogItem(task: Task): WeekBacklogItem {
  return {
    taskId: task.id,
    title: task.title,
    dateIntent: effectiveDateIntent(task),
    dueDate: task.dueDate,
    scheduledDate: task.scheduledDate,
    projectId: task.projectId,
    domainId: task.domainId,
    effortMinutes: task.effortMinutes
  };
}
