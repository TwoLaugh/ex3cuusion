import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayListView, dayView, instantCaptureToDayList } from "@/lib/state";

// T092 inline instant add: creates a minimal task (effort 30, priority 5, unfiled) and appends
// it to today's list as ONE undoable change, returning immediately — the add NEVER blocks on AI.
//
// CLIENT CONTRACT: after this responds, fire POST /api/day-list/enrich { taskId } (non-blocking,
// e.g. without awaiting before re-render) to run AI enrichment (folder/effort/dates parsed from
// the title) and toast what it decided. Route handlers cannot reliably fire-and-forget after
// responding, so the client owns kicking off the enrichment call.
const captureSchema = z.object({
  title: z.string()
});

export async function POST(request: NextRequest) {
  const input = captureSchema.parse(await request.json());
  const { state, taskId } = instantCaptureToDayList(input.title);
  return NextResponse.json({ state, plan: dayView(), dayList: dayListView(), taskId });
}
