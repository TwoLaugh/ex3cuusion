import type { PlanItem } from "@/lib/types";
import { fromMinutes, isClockTime, toMinutes } from "./format";

export interface PendingTimelineMove {
  date: string;
  startTime: string;
  endTime: string;
}

export const pixelsPerMinute = 2;

export function buildTimeline(items: PlanItem[], currentTime?: string) {
  const scheduled = items.filter((item) => isClockTime(item.startTime) && isClockTime(item.endTime));
  const unscheduled = items.filter((item) => !isClockTime(item.startTime) || !isClockTime(item.endTime));
  const scheduledWithLanes = assignOverlapLanes(scheduled, currentTime);
  const fallbackStart = currentTime ? toMinutes(currentTime) : 8 * 60;
  const fallbackEnd = currentTime ? toMinutes(currentTime) : 17 * 60;
  const startMinutes = Math.max(0, Math.min(...scheduled.map((item) => absoluteStartMinutes(item, currentTime)), fallbackStart) - 30);
  const endMinutes = Math.max(...scheduled.map((item) => absoluteEndMinutes(item, currentTime)), fallbackEnd) + 30;
  const height = Math.max(480, (endMinutes - startMinutes) * pixelsPerMinute);
  const firstHour = Math.ceil(startMinutes / 60) * 60;
  const hours = [];

  for (let minute = firstHour; minute <= endMinutes; minute += 60) {
    hours.push({ time: fromMinutes(minute), top: (minute - startMinutes) * pixelsPerMinute });
  }

  return {
    height,
    hours,
    startMinutes,
    endMinutes,
    unscheduled,
    items: scheduledWithLanes.map(({ item, lane, laneCount }) => {
      const itemStart = absoluteStartMinutes(item, currentTime);
      const itemEnd = absoluteEndMinutes(item, currentTime);
      const gutter = laneCount > 1 ? 1.5 : 0;
      const width = laneCount > 1 ? 100 / laneCount - gutter : 100;
      return {
        item,
        top: (itemStart - startMinutes) * pixelsPerMinute,
        height: Math.max(22, (itemEnd - itemStart) * pixelsPerMinute - 6),
        left: laneCount > 1 ? lane * (100 / laneCount) : 0,
        width,
        laneCount
      };
    })
  };
}

export function assignOverlapLanes(items: PlanItem[], currentTime?: string) {
  const sorted = [...items].sort((a, b) => absoluteStartMinutes(a, currentTime) - absoluteStartMinutes(b, currentTime));
  const laneEnds: number[] = [];
  const assigned = sorted.map((item) => {
    const start = absoluteStartMinutes(item, currentTime);
    const end = absoluteEndMinutes(item, currentTime);
    let lane = laneEnds.findIndex((candidateEnd) => candidateEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    return { item, lane, start, end, laneCount: 1 };
  });

  return assigned.map((entry) => {
    const laneCount = Math.max(
      1,
      ...assigned
        .filter((candidate) => candidate.start < entry.end && candidate.end > entry.start)
        .map((candidate) => candidate.lane + 1)
    );
    return { ...entry, laneCount };
  });
}

export function endMinutesFor(item: PlanItem): number {
  const start = toMinutes(item.startTime);
  const end = toMinutes(item.endTime);
  return end <= start ? end + 24 * 60 : end;
}

export function absoluteStartMinutes(item: PlanItem, currentTime?: string): number {
  const start = toMinutes(item.startTime);
  const current = currentTime ? toMinutes(currentTime) : 0;
  if (current >= 18 * 60 && start < 6 * 60) return start + 24 * 60;
  return start;
}

export function absoluteEndMinutes(item: PlanItem, currentTime?: string): number {
  const start = absoluteStartMinutes(item, currentTime);
  const rawEnd = toMinutes(item.endTime);
  const normalizedEnd = rawEnd <= toMinutes(item.startTime) ? rawEnd + 24 * 60 : rawEnd;
  return normalizedEnd < start ? normalizedEnd + 24 * 60 : normalizedEnd;
}

export function applyPendingTimelineMoves(items: PlanItem[], planDate: string, moves: Record<string, PendingTimelineMove>): PlanItem[] {
  if (Object.keys(moves).length === 0) return items;
  return items.map((item) => {
    if (!item.taskId) return item;
    const move = moves[item.taskId];
    if (!move || move.date !== planDate) return item;
    return {
      ...item,
      startTime: move.startTime,
      endTime: move.endTime,
      fixedStartTime: move.startTime
    };
  });
}

export function removePendingTimelineMove(
  moves: Record<string, PendingTimelineMove>,
  taskId: string,
  move: PendingTimelineMove
): Record<string, PendingTimelineMove> {
  const current = moves[taskId];
  if (!current || current.date !== move.date || current.startTime !== move.startTime) return moves;
  const next = { ...moves };
  delete next[taskId];
  return next;
}
