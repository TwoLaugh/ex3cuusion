import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addTaskToDayList, dayListView, dayView, getState, removeTaskFromDayList, reorderDayList, setDayListPin } from "@/lib/state";

// T092: explicit, undoable mutations on today's hand-authored list. The first read of a day
// builds the morning list automatically (ensureDayList inside dayListView), so GET here — or the
// dayList field on /api/state — is all the UI needs to materialize the day.
const mutationSchema = z.object({
  action: z.enum(["add", "remove", "reorder", "pin"]),
  taskId: z.string().optional(),
  orderedTaskIds: z.array(z.string()).optional(),
  pinnedTime: z.string().optional(),
  source: z.enum(["recurring", "manual", "tray", "ai", "carried"]).optional()
});

export async function GET() {
  return NextResponse.json({ state: getState(), plan: dayView(), dayList: dayListView() });
}

export async function POST(request: NextRequest) {
  const input = mutationSchema.parse(await request.json());
  if (input.action === "add" && input.taskId) addTaskToDayList(input.taskId, { source: input.source });
  if (input.action === "remove" && input.taskId) removeTaskFromDayList(input.taskId);
  if (input.action === "reorder" && input.orderedTaskIds) reorderDayList(input.orderedTaskIds);
  if (input.action === "pin" && input.taskId) setDayListPin(input.taskId, input.pinnedTime);
  return NextResponse.json({ state: getState(), plan: dayView(), dayList: dayListView() });
}
