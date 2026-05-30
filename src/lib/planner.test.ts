import { describe, expect, it } from "vitest";
import { buildDayPlan } from "./planner";
import { createSeedState } from "./seed";

describe("buildDayPlan", () => {
  it("builds Today from routines, project blocks, quick tasks, and soft invitations", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    const plan = buildDayPlan(state);

    expect(plan.date).toBe("2026-06-01");
    expect(plan.items.some((item) => item.title === "Back rehab" && item.section === "routines")).toBe(true);
    expect(plan.items.some((item) => item.title === "Diet App" && item.section === "main_blocks")).toBe(true);
    expect(plan.items.some((item) => item.title === "Message Will" && item.section === "quick_tasks")).toBe(true);
    expect(plan.items.some((item) => item.title === "Clean garage" && item.section === "soft_invitations")).toBe(true);
  });

  it("reduces capacity after repeated overload deferrals", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    state.deferrals.push(
      { id: "d1", date: "2026-06-01", planItemId: "a", reason: "overplanned" },
      { id: "d2", date: "2026-06-01", planItemId: "b", reason: "no_time" },
      { id: "d3", date: "2026-06-02", planItemId: "c", reason: "low_energy" }
    );

    const plan = buildDayPlan(state);

    expect(plan.availableMinutes).toBe(210);
  });

  it("uses the clock to avoid pretending a full workday remains at night", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "19:30";

    const plan = buildDayPlan(state);

    expect(plan.availableMinutes).toBe(150);
    expect(plan.loadLevel).toBe("overloaded");
  });

  it("pins fixed anchors like sleep and moves conflicting flexible work out of the timed plan", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "22:47";
    state.tasks = [
      {
        id: "task_chores",
        title: "Tidy the garage",
        type: "atomic",
        domainId: "domain_house",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "maintenance", pressureLevel: "soft" },
        priority: 4,
        importance: 4,
        urgency: 4,
        effortMinutes: 90,
        energy: "medium",
        strictness: "flexible"
      },
      {
        id: "task_sleep",
        title: "Sleep",
        type: "atomic",
        domainId: "domain_health",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "recovery", pressureLevel: "fixed" },
        priority: 10,
        importance: 10,
        urgency: 10,
        scheduledDate: "2026-06-01",
        scheduledTime: "23:30",
        effortMinutes: 480,
        energy: "low",
        strictness: "strict"
      }
    ];
    state.projects = [];
    state.routines = [];

    const plan = buildDayPlan(state);
    const sleep = plan.items.find((item) => item.title === "Sleep");
    const chores = plan.items.find((item) => item.title === "Tidy the garage");

    expect(sleep?.startTime).toBe("23:30");
    expect(chores?.status).toBe("unscheduled");
    expect(chores?.reason).toContain("Does not fit before Sleep at 23:30");
  });

  it("treats relationship suggestion containers as soft invitations, not project blocks", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-03";
    state.currentTime = "08:30";

    const plan = buildDayPlan(state);
    const emmaBlock = plan.items.find((item) => item.title === "Emma");
    const readTogether = plan.items.find((item) => item.title === "Read together");

    expect(emmaBlock).toBeUndefined();
    expect(readTogether?.section).toBe("soft_invitations");
    expect(readTogether?.reason).toContain("Reusable suggestion");
  });

  it("shows repeating tasks as routine-like Today items", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-02";
    state.currentTime = "08:30";
    state.routines = [];
    state.tasks.push({
      id: "task_walk",
      title: "Walk",
      type: "atomic",
      domainId: "domain_health",
      status: "active",
      repeatPolicy: { type: "daily", carryover: "skip" },
      completionBehavior: "repeatable",
      plannerFields: { intentType: "health", pressureLevel: "scheduled", location: "outside", setupCost: "low" },
      priority: 4,
      importance: 4,
      urgency: 2,
      effortMinutes: 30,
      energy: "low",
      strictness: "normal"
    });

    const plan = buildDayPlan(state);
    const walk = plan.items.find((item) => item.title === "Walk");

    expect(walk?.type).toBe("routine");
    expect(walk?.section).toBe("routines");
  });
});
