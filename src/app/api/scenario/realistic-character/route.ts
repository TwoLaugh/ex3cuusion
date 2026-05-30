import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { loadRealisticCharacterScenario } from "@/lib/state";

export async function POST() {
  const state = loadRealisticCharacterScenario();
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
