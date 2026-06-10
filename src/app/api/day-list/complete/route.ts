import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { completeTaskDirect, dayListView, dayView } from "@/lib/state";

// T092: tick a list entry or habit straight off the task — no plan item required. Toggles
// (ticking a completed task un-ticks it), shares completion semantics with the timeline, and is
// undoable.
const completeSchema = z.object({
  taskId: z.string(),
  actualMinutes: z.number().optional()
});

export async function POST(request: NextRequest) {
  const input = completeSchema.parse(await request.json());
  const state = completeTaskDirect(input.taskId, input.actualMinutes);
  return NextResponse.json({ state, plan: dayView(), dayList: dayListView() });
}
