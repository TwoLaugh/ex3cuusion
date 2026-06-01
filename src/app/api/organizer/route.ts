import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { listChangeHistory, runOrganizerPass } from "@/lib/state";

// Trigger a conservative proactive maintenance pass (T066). Auto-applied; reversible via
// /api/history (the pass is one "organizer" change entry).
export async function POST() {
  const state = await runOrganizerPass();
  return NextResponse.json({ state, plan: buildDayPlan(state), history: listChangeHistory() });
}
