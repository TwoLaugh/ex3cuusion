import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
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
  note: z.string().optional(),
  deferredTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export async function POST(request: NextRequest) {
  const input = deferSchema.parse(await request.json());
  const state = deferPlanItem(input.planItemId, input.reason, input.note, input.deferredTo);
  return NextResponse.json({ state, plan: dayView() });
}
