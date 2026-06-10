import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { getState, resetState } from "@/lib/state";

export async function GET() {
  const state = getState();
  return NextResponse.json({ state, plan: dayView() });
}

export async function POST() {
  const state = resetState();
  return NextResponse.json({ state, plan: dayView() });
}
