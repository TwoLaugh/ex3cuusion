import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { listChangeHistory, maybeRunDailyOrganizer, runOrganizerPass } from "@/lib/state";

const organizerSchema = z.object({ auto: z.boolean().optional() });

// Conservative proactive maintenance pass (T066). `auto: true` runs the once-per-day guarded
// version (T069); otherwise an explicit on-demand pass. Auto-applied; reversible via /api/history.
export async function POST(request: NextRequest) {
  const { auto } = organizerSchema.parse(await request.json().catch(() => ({})));
  const state = auto ? await maybeRunDailyOrganizer() : await runOrganizerPass();
  return NextResponse.json({ state, plan: buildDayPlan(state), history: listChangeHistory() });
}
