import { describe, expect, it } from "vitest";
import { interpretInboxInput } from "./ai-actions";
import { createSeedState } from "./seed";

describe("interpretInboxInput", () => {
  it("turns messy input into structured auto-applicable actions", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    const entry = await interpretInboxInput(
      "Need back rehab daily, clean garage this weekend, finish diet app auth bug before Friday, and message Will.",
      state
    );

    expect(entry.actions.length).toBeGreaterThanOrEqual(3);
    expect(entry.actions.some((action) => action.label.toLowerCase().includes("back"))).toBe(true);
    expect(entry.actions.some((action) => action.label.toLowerCase().includes("garage"))).toBe(true);
    expect(entry.actions.some((action) => action.label.toLowerCase().includes("will"))).toBe(true);
  });

  it("returns a clarification action when input cannot be safely structured", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    const entry = await interpretInboxInput("Stuff about the thing maybe later", state);

    expect(entry.actions.some((action) => action.type === "ask_clarification")).toBe(true);
  });
});
