import { beforeEach, describe, expect, it } from "vitest";
import { buildDayPlan } from "./planner";
import { advanceDay, completePlanItem, deferPlanItem, getState, resetState, retreatDay, setClock, submitInbox } from "./state";

describe("state integration", () => {
  beforeEach(() => {
    resetState();
    setClock("2026-06-01", "08:30");
  });

  it("applies inbox actions and updates the plan", async () => {
    const before = getState();
    const beforeCount = before.tasks.length;

    const after = await submitInbox("message Will and clean garage this weekend");
    const plan = buildDayPlan(after);

    expect(after.tasks.length).toBeGreaterThan(beforeCount);
    expect(after.inbox[0].actions.every((action) => action.status === "applied")).toBe(true);
    expect(plan.items.some((item) => item.title === "Message Will")).toBe(true);
  });

  it("records completion and deferral events against the active day", () => {
    const plan = buildDayPlan(getState());
    const routine = plan.items.find((item) => item.title === "Back rehab");
    const project = plan.items.find((item) => item.title === "Diet App");

    expect(routine).toBeDefined();
    expect(project).toBeDefined();

    completePlanItem(routine!.id, 18);
    expect(buildDayPlan(getState()).items.find((item) => item.id === routine!.id)?.status).toBe("completed");
    completePlanItem(routine!.id, 18);
    expect(buildDayPlan(getState()).items.find((item) => item.id === routine!.id)?.status).toBe("planned");
    deferPlanItem(project!.id, "overplanned");

    const state = getState();
    expect(state.completions).toHaveLength(0);
    expect(state.deferrals).toHaveLength(1);
  });

  it("advances dates for full-week simulations", () => {
    expect(getState().currentDate).toBe("2026-06-01");
    advanceDay();
    advanceDay();
    expect(getState().currentDate).toBe("2026-06-03");
    retreatDay();
    expect(getState().currentDate).toBe("2026-06-02");
  });
});
