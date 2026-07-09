import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { applyStructureMutation, getState, type StructureMutation } from "@/lib/state";

export async function POST(request: Request) {
  try {
    const mutation = (await request.json()) as StructureMutation;
    const state = applyStructureMutation(mutation);
    return NextResponse.json({ state, plan: dayView() });
  } catch (error) {
    const state = getState();
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not update structure.",
        state,
        plan: dayView()
      },
      { status: 400 }
    );
  }
}
