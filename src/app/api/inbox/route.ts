import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { submitInbox } from "@/lib/state";

const inboxSchema = z.object({
  input: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const { input } = inboxSchema.parse(await request.json());
    const state = await submitInbox(input);
    const elapsedMs = Date.now() - started;
    if (elapsedMs >= Number(process.env.AI_INBOX_SLOW_LOG_MS ?? 10_000)) {
      console.warn("[ai-inbox] slow request", {
        elapsedMs,
        model: process.env.OPENAI_MODEL ?? "fixture",
        inputLength: input.length
      });
    }
    return NextResponse.json({ state, plan: buildDayPlan(state) });
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const status = error instanceof z.ZodError ? 400 : 502;
    const message = error instanceof Error ? error.message : "AI inbox request failed.";
    console.error("[ai-inbox] request failed", {
      status,
      elapsedMs,
      model: process.env.OPENAI_MODEL ?? "fixture",
      error: message
    });
    return NextResponse.json({ error: message, elapsedMs }, { status });
  }
}
