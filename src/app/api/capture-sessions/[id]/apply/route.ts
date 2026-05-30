import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { applyCaptureSession } from "@/lib/state";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const state = applyCaptureSession(params.id);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
