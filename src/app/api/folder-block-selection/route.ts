import { NextResponse } from "next/server";
import { z } from "zod";
import { dayView } from "@/lib/state";
import { updateFolderBlockSelection } from "@/lib/state";

const selectionSchema = z.object({
  planItemId: z.string(),
  taskId: z.string().optional(),
  action: z.enum(["add", "remove", "regenerate"])
});

export async function POST(request: Request) {
  const input = selectionSchema.parse(await request.json());
  const state = updateFolderBlockSelection(input);
  return NextResponse.json({ state, plan: dayView() });
}
