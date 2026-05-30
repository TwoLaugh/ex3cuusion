import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { rejectAiAction } from "@/lib/state";

const rejectSchema = z.object({
  reason: z.string().optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const input = rejectSchema.parse(await request.json().catch(() => ({})));
  const state = rejectAiAction(id, input.reason);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
