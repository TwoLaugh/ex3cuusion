import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { completePlanItem } from "@/lib/state";

const completeSchema = z.object({
  planItemId: z.string(),
  actualMinutes: z.number().optional()
});

export async function POST(request: NextRequest) {
  const input = completeSchema.parse(await request.json());
  const state = completePlanItem(input.planItemId, input.actualMinutes);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
