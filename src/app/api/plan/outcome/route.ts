import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
import { recordPlanItemOutcome } from "@/lib/state";

const outcomeSchema = z.object({
  planItemId: z.string(),
  type: z.enum([
    "worked_on",
    "partially_completed",
    "deferred",
    "blocked",
    "waiting_on",
    "skipped",
    "canceled",
    "marked_not_important"
  ]),
  reason: z
    .enum([
      "no_time",
      "low_energy",
      "blocked",
      "too_vague",
      "overplanned",
      "avoidance",
      "not_important",
      "moved_intentionally",
      "other",
      "did_part",
      "waiting_on",
      "skipped",
      "canceled"
    ])
    .optional(),
  note: z.string().optional(),
  actualMinutes: z.number().optional(),
  nextAction: z.string().optional(),
  blocked: z
    .object({
      blockedBy: z.enum(["person", "decision", "missing_info", "materials", "money", "date", "external_event", "emotional_resistance"]),
      note: z.string().optional(),
      unblockAction: z.string().optional()
    })
    .optional(),
  waiting: z
    .object({
      waitingOn: z.string(),
      requestedAt: z.string().optional(),
      followUpDate: z.string().optional(),
      context: z.string().optional()
    })
    .optional()
});

export async function POST(request: NextRequest) {
  const input = outcomeSchema.parse(await request.json());
  const state = recordPlanItemOutcome(input);
  return NextResponse.json({ state, plan: dayView() });
}
