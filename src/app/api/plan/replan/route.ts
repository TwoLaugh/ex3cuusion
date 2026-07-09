import { NextResponse } from "next/server";
import { dayView, replanRestOfDay } from "@/lib/state";

// T090: the ONLY reshuffler of a committed day. Keeps settled items, regenerates the rest, and
// records one undoable "replan" change.
export async function POST() {
  const state = replanRestOfDay();
  return NextResponse.json({ state, plan: dayView() });
}
