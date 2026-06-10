import { NextResponse } from "next/server";
import { dayListView, dayView } from "@/lib/state";
import { getState, resetState } from "@/lib/state";

// T092: the state payload carries dayList (the list-first Today read model) everywhere plan
// already travels, so the UI gets list + tray + gauges with no extra round trip. Reading
// dayList/plan auto-materializes today's morning list and committed plan (silent, no history).
export async function GET() {
  const state = getState();
  return NextResponse.json({ state, plan: dayView(), dayList: dayListView() });
}

export async function POST() {
  const state = resetState();
  return NextResponse.json({ state, plan: dayView(), dayList: dayListView() });
}
