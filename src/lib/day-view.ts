// T090: committed day plans. buildDayPlan stays a pure generator; the functions here turn a
// generated plan into a stored commitment and re-render a commitment with LIVE status overlays
// (done/deferred from events, missed from the clock). state.ts owns when commitments are
// created/replaced; everything in this module is a pure function over AppState.
import { timeToMinutes } from "./dates";
import {
  blockCompletionPlanIds,
  buildDayPlan,
  calculateCapacity,
  completedTaskIdsByPlan,
  countsTowardCommittedLoad,
  isItemCompleted,
  loadLevel
} from "./planner";
import type { AppState, CommittedDayPlan, CommittedPlanItem, DayPlan, PlanItem, PlanItemStatus } from "./types";

const CLOCK_TIME = /^\d{2}:\d{2}$/;

export function snapshotPlanItem(item: PlanItem): CommittedPlanItem {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    section: item.section,
    startTime: item.startTime,
    endTime: item.endTime,
    fixedStartTime: item.fixedStartTime,
    hardAnchor: item.hardAnchor,
    taskId: item.taskId,
    folderId: item.folderId,
    selectedTaskIds: item.selectedTaskIds ? [...item.selectedTaskIds] : undefined,
    estimatedMinutes: item.estimatedMinutes,
    clockMinutes: item.clockMinutes,
    blockingMinutes: item.blockingMinutes,
    schedulingMode: item.schedulingMode,
    attentionLoad: item.attentionLoad,
    canOverlap: item.canOverlap,
    overlapKinds: item.overlapKinds ? [...item.overlapKinds] : undefined,
    phaseKind: item.phaseKind,
    phaseIndex: item.phaseIndex,
    parentTaskId: item.parentTaskId,
    reason: item.reason
  };
}

// Snapshot a fresh generation of today's plan as the commitment for state.currentDate.
export function buildCommitment(state: AppState): CommittedDayPlan {
  return {
    date: state.currentDate,
    committedAt: stateTimestamp(state),
    items: buildDayPlan(state).items.map(snapshotPlanItem)
  };
}

export function findCommitment(state: AppState, date: string): CommittedDayPlan | undefined {
  return (state.committedPlans ?? []).find((entry) => entry.date === date);
}

// Render a commitment as a DayPlan with live status overlays. Completed/deferred resolution
// reuses the exact helpers buildDayPlan uses; a still-planned item whose window already passed
// becomes "missed" (it stays visible until acted on instead of silently vanishing).
export function renderCommittedPlan(state: AppState, commitment: CommittedDayPlan): DayPlan {
  const date = commitment.date;
  const completed = new Set(state.completions.filter((event) => event.date === date).map((event) => event.planItemId));
  const deferred = new Set(state.deferrals.filter((event) => event.date === date).map((event) => event.planItemId));
  const completedByPlan = completedTaskIdsByPlan(state, date);
  const blockDonePlanIds = blockCompletionPlanIds(state, date);
  const outcomePlanIds = new Set(
    state.executionEvents
      .filter((event) => event.date === date && event.planItemId && event.type !== "completed")
      .map((event) => event.planItemId as string)
  );
  const nowMinutes = timeToMinutes(state.currentTime);

  const items: PlanItem[] = commitment.items
    .map((entry) => {
      const base: PlanItem = { ...entry, status: "planned" };
      const scheduled = CLOCK_TIME.test(entry.startTime) && CLOCK_TIME.test(entry.endTime);
      const status: PlanItemStatus = isItemCompleted(base, completed, completedByPlan, blockDonePlanIds)
        ? "completed"
        : deferred.has(entry.id) || outcomePlanIds.has(entry.id)
          ? "deferred"
          : !scheduled
            ? "unscheduled"
            : endMinutesOf(entry) <= nowMinutes
              ? "missed"
              : "planned";
      return { ...base, status };
    })
    .sort((a, b) => sortTime(a.startTime) - sortTime(b.startTime));

  const availableMinutes = calculateCapacity(state);
  // Missed items are still committed, unfinished work, so they keep counting toward the load.
  const estimatedTotalMinutes = items
    .filter((item) => item.status === "planned" || item.status === "missed")
    .filter(countsTowardCommittedLoad)
    .reduce((sum, item) => sum + (item.blockingMinutes ?? item.estimatedMinutes), 0);
  const level = loadLevel(estimatedTotalMinutes, availableMinutes);

  return {
    date,
    loadLevel: level,
    estimatedTotalMinutes,
    availableMinutes,
    summary:
      level === "overloaded"
        ? "Today is overloaded. Cut soft invitations first."
        : "A focused day built from routines, project momentum, and time-sensitive tasks.",
    committedAt: commitment.committedAt,
    items
  };
}

// Cheap staleness signal: how many plannable-today items a fresh generation would add that are
// not part of the committed plan (new tasks captured after commit do NOT mutate the day).
export function countNewCandidates(state: AppState, commitment: CommittedDayPlan): number {
  const committedIds = new Set(commitment.items.map((item) => item.id));
  return buildDayPlan(state).items.filter(
    (item) => !committedIds.has(item.id) && item.status !== "completed" && item.status !== "deferred"
  ).length;
}

export function stateTimestamp(state: AppState): string {
  return new Date(`${state.currentDate}T${state.currentTime}:00.000Z`).toISOString();
}

// Wrap-aware end minutes (mirrors the client's endMinutesFor): an item crossing midnight gets its
// end pushed past 24h so an evening clock does not flag it as missed.
function endMinutesOf(item: CommittedPlanItem): number {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return end <= start ? end + 24 * 60 : end;
}

function sortTime(time: string): number {
  return CLOCK_TIME.test(time) ? timeToMinutes(time) : Number.POSITIVE_INFINITY;
}
