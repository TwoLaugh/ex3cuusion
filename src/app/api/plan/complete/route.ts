import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
import { completePlanItem } from "@/lib/state";

const completeSchema = z.object({
  planItemId: z.string(),
  completedTaskIds: z.array(z.string()).optional(),
  actualMinutes: z.number().optional()
});

export async function POST(request: NextRequest) {
  const input = completeSchema.parse(await request.json());
  const state = completePlanItem(input.planItemId, input.actualMinutes, input.completedTaskIds);
  return NextResponse.json({ state, plan: dayView() });
}
