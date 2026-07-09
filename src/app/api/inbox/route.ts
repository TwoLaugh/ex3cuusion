import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
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
        model: process.env.OPENAI_INBOX_MODEL ?? process.env.OPENAI_MODEL ?? "fixture",
        inputLength: input.length
      });
    }
    return NextResponse.json({ state, plan: dayView() });
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const status = error instanceof z.ZodError ? 400 : 502;
    const rawMessage = error instanceof Error ? error.message : "AI inbox request failed.";
    const timedOut = /timed out|timeout/i.test(rawMessage);
    const message = timedOut ? "AI request timed out before anything was saved. Please try again." : rawMessage;
    console.error("[ai-inbox] request failed", {
      status,
      elapsedMs,
      model: process.env.OPENAI_INBOX_MODEL ?? process.env.OPENAI_MODEL ?? "fixture",
      timeoutMs: Number(process.env.OPENAI_INBOX_TIMEOUT_MS ?? process.env.OPENAI_TIMEOUT_MS ?? 180_000),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 0),
      error: rawMessage
    });
    return NextResponse.json({ error: message, elapsedMs, timedOut }, { status });
  }
}
