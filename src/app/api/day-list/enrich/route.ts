import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayListView, dayView, enrichCapturedTask, getState } from "@/lib/state";

// T092 capture enrichment: the client calls this AFTER /api/day-list/capture responds (v1
// async-enrichment contract — see the capture route). Runs the capture-revision interpreter on
// the raw task title to fill in folder/effort/dates, as its own undoable change. Deterministic
// fixture path in test/fixture mode; failures leave the captured task as typed.
const enrichSchema = z.object({
  taskId: z.string()
});

export async function POST(request: NextRequest) {
  const input = enrichSchema.parse(await request.json());
  try {
    const state = await enrichCapturedTask(input.taskId);
    return NextResponse.json({ state, plan: dayView(), dayList: dayListView() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not enrich the captured task.",
        state: getState(),
        plan: dayView(),
        dayList: dayListView()
      },
      { status: 200 } // enrichment is best-effort; the capture itself already succeeded
    );
  }
}
