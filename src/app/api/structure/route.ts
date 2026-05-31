import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { applyStructureMutation, getState, type StructureMutation } from "@/lib/state";

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as StructureMutation;
    const state = applyStructureMutation(mutation);
    return NextResponse.json({ state, plan: buildDayPlan(state) });
  } catch (error) {
    const state = getState();
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update structure.",
        state,
        plan: buildDayPlan(state)
      },
      { status: 400 }
    );
  }
}
