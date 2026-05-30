import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { addCaptureSessionMessage } from "@/lib/state";

const messageSchema = z.object({
  message: z.string().min(1)
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const input = messageSchema.parse(await request.json());
  const state = await addCaptureSessionMessage(params.id, input.message.trim());
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
