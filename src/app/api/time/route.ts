import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { advanceDay, getState, retreatDay, setDate } from "@/lib/state";

const setTimeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  advance: z.boolean().optional(),
  retreat: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const input = setTimeSchema.parse(await request.json());
  const state = input.advance ? advanceDay() : input.retreat ? retreatDay() : input.date ? setDate(input.date, input.time) : getState();
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
