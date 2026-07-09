import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { dismissCaptureSession } from "@/lib/state";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const state = dismissCaptureSession(params.id);
  return NextResponse.json({ state, plan: dayView() });
}
