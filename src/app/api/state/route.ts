import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { getState, resetState } from "@/lib/state";

export async function GET() {
  const state = getState();
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}

export async function POST() {
  const state = resetState();
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
