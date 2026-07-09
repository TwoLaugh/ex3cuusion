import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addTaskToDayList, dayListView, dayView, getState, removeTaskFromDayList, reorderDayList, resolveStaleTask, setDayListPin } from "@/lib/state";

// T092: explicit, undoable mutations on today's hand-authored list. The first read of a day
// builds the morning list automatically (ensureDayList inside dayListView), so GET here — or the
// dayList field on /api/state — is all the UI needs to materialize the day.
// T093: "resolve-stale" answers the aging question on a staleQuestion tray row — resolution
// "someday" (spaced resurfacing) or "keep" (clear the ignore streak). Never an automatic archive.
// T110: an optional `date` targets a future day for the plan-ahead surface (the evening ritual);
// omitted, every action operates on today exactly as before.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mutationSchema = z.object({
  action: z.enum(["add", "remove", "reorder", "pin", "resolve-stale"]),
  taskId: z.string().optional(),
  orderedTaskIds: z.array(z.string()).optional(),
  pinnedTime: z.string().optional(),
  source: z.enum(["recurring", "manual", "tray", "ai", "carried"]).optional(),
  resolution: z.enum(["someday", "keep"]).optional(),
  date: isoDate.optional()
});

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam && isoDate.safeParse(dateParam).success ? dateParam : undefined;
  return NextResponse.json({ state: getState(), plan: dayView(), dayList: dayListView(undefined, date) });
}

export async function POST(request: NextRequest) {
  const input = mutationSchema.parse(await request.json());
  if (input.action === "add" && input.taskId) addTaskToDayList(input.taskId, { source: input.source, date: input.date });
  if (input.action === "remove" && input.taskId) removeTaskFromDayList(input.taskId, input.date);
  if (input.action === "reorder" && input.orderedTaskIds) reorderDayList(input.orderedTaskIds, input.date);
  if (input.action === "pin" && input.taskId) setDayListPin(input.taskId, input.pinnedTime, input.date);
  if (input.action === "resolve-stale" && input.taskId && input.resolution) resolveStaleTask(input.taskId, input.resolution);
  return NextResponse.json({ state: getState(), plan: dayView(), dayList: dayListView(undefined, input.date) });
}
