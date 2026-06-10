import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
import { answerCaptureQuestion } from "@/lib/state";

const answerSchema = z.object({
  questionId: z.string(),
  answer: z.string().min(1)
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const input = answerSchema.parse(await request.json());
  const state = answerCaptureQuestion(params.id, input.questionId, input.answer.trim());
  return NextResponse.json({ state, plan: dayView() });
}
