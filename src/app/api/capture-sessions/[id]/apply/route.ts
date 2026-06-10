import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { applyCaptureSession } from "@/lib/state";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const state = applyCaptureSession(params.id);
  return NextResponse.json({ state, plan: dayView() });
}
