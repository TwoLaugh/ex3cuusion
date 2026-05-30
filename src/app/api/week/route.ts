import { NextResponse } from "next/server";
import { getState } from "@/lib/state";
import { buildWeekPlan } from "@/lib/week-plan";

export async function GET() {
  const state = getState();
  return NextResponse.json({ state, week: buildWeekPlan(state) });
}
