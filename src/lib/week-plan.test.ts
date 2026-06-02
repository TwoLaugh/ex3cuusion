import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { buildWeekPlan } from "./week-plan";

describe("buildWeekPlan", () => {
  it("builds a Monday-start week from daily plans", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-03";
    state.currentTime = "11:30";

    const week = buildWeekPlan(state);

    expect(week.startDate).toBe("2026-06-01");
    expect(week.endDate).toBe("2026-06-07");
    expect(week.days.map((day) => day.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
      "2026-06-07"
    ]);
  });

  it("keeps week-window tasks in week backlog until they receive an exact scheduled date", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-02";
    state.currentTime = "08:30";
    state.tasks.push({
      id: "task_dentist_next_week",
      title: "Book dentist",
      type: "atomic",
      folderId: "domain_health",
      status: "active",
      repeatPolicy: { type: "none" },
      completionBehavior: "exhaust_once",
      completionMode: "simple_done",
      plannerFields: { intentType: "health", pressureLevel: "soft" },
      dateIntent: {
        kind: "week_window",
        originalText: "book dentist sometime next week",
        startDate: "2026-06-08",
        endDate: "2026-06-14",
        confidence: 0.75
      },
      priority: 3,
      importance: 4,
      urgency: 2,
      effortMinutes: 15,
      energy: "low",
      strictness: "normal"
    });

    const week = buildWeekPlan(state);

    expect(week.thisWeekBacklog.some((task) => task.title === "Book dentist")).toBe(false);
    expect(week.nextWeekBacklog.find((task) => task.title === "Book dentist")?.dateIntent).toMatchObject({
      kind: "week_window",
      startDate: "2026-06-08",
      endDate: "2026-06-14"
    });
  });
});
