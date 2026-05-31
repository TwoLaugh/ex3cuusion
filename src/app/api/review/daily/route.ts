import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { dailyReviewSummary, submitDailyReview } from "@/lib/state";

const dailyReviewSchema = z.object({
  date: z.string().optional(),
  energy: z.enum(["low", "normal", "high"]),
  planFit: z.enum(["underfilled", "realistic", "overplanned"]),
  note: z.string().max(280).optional(),
  affectPlanning: z.boolean().optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json({ summary: dailyReviewSummary(url.searchParams.get("date") ?? undefined) });
}

export async function POST(request: Request) {
  const input = dailyReviewSchema.parse(await request.json());
  const state = submitDailyReview(input);
  return NextResponse.json({ state, plan: buildDayPlan(state), summary: dailyReviewSummary(input.date) });
}
