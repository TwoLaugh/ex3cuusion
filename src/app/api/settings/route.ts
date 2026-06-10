import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
import { getState, setAutoOrganizeEnabled, setAvailableMinutes } from "@/lib/state";

const settingsSchema = z.object({
  autoOrganizeEnabled: z.boolean().optional(),
  availableMinutes: z.number().int().min(90).max(960).optional()
});

// Update app settings. Settings are independent, so callers may send one field at a time.
export async function POST(request: NextRequest) {
  const settings = settingsSchema.parse(await request.json());
  let state = getState();
  if (settings.autoOrganizeEnabled !== undefined) state = setAutoOrganizeEnabled(settings.autoOrganizeEnabled);
  if (settings.availableMinutes !== undefined) state = setAvailableMinutes(settings.availableMinutes);
  return NextResponse.json({ state, plan: dayView() });
}
