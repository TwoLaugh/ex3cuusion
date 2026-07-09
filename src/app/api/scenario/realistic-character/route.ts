import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { loadRealisticCharacterScenario } from "@/lib/state";

export async function POST() {
  const state = loadRealisticCharacterScenario();
  return NextResponse.json({ state, plan: dayView() });
}
