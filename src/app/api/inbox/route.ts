import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { submitInbox } from "@/lib/state";

const inboxSchema = z.object({
  input: z.string().min(1)
});

export async function POST(request: NextRequest) {
  try {
    const { input } = inboxSchema.parse(await request.json());
    const state = await submitInbox(input);
    return NextResponse.json({ state, plan: buildDayPlan(state) });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 502;
    const message = error instanceof Error ? error.message : "AI inbox request failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
