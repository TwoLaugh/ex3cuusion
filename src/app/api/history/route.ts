import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { listChangeHistory, undoChange } from "@/lib/state";

export async function GET() {
  return NextResponse.json({ history: listChangeHistory() });
}

const undoSchema = z.object({ id: z.string().optional() });

export async function POST(request: NextRequest) {
  const { id } = undoSchema.parse(await request.json().catch(() => ({})));
  const state = undoChange(id);
  return NextResponse.json({ state, plan: buildDayPlan(state), history: listChangeHistory() });
}
