import { NextRequest, NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { confirmAiAction } from "@/lib/state";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const state = confirmAiAction(id);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
