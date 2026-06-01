import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDayPlan } from "@/lib/planner";
import { setAutoOrganizeEnabled } from "@/lib/state";

const settingsSchema = z.object({ autoOrganizeEnabled: z.boolean() });

// Update app settings (T074). Currently just the auto-organizer on/off switch.
export async function POST(request: NextRequest) {
  const { autoOrganizeEnabled } = settingsSchema.parse(await request.json());
  const state = setAutoOrganizeEnabled(autoOrganizeEnabled);
  return NextResponse.json({ state, plan: buildDayPlan(state) });
}
