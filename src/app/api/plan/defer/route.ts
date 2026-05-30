import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { deferPlanItem } from "@/lib/state";

const deferSchema = z.object({
  planItemId: z.string(),
  reason: z.enum([
    "no_time",
    "low_energy",
    "blocked",
    "too_vague",
    "overplanned",
    "avoidance",
    "not_important",
    "moved_intentionally",
    "other"
  ]),
  note: z.string().optional()
});

export async function POST(request: NextRequest) {
  const input = deferSchema.parse(await request.json());
  const state = deferPlanItem(input.planItemId, input.reason, input.note);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
