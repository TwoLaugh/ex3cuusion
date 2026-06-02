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

  it("uses daily review calibration to reduce future capacity", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-02";
    state.currentTime = "08:30";
    state.dailyReviews.push({
      id: "review_low_energy",
      date: "2026-06-01",
      createdAt: "2026-06-01T22:00:00.000Z",
      energy: "low",
      planFit: "overplanned",
      affectPlanning: true,
      capacityAdjustmentMinutes: -75,
      completedCount: 1,
      partialCount: 1,
      deferredCount: 2,
      blockedCount: 0,
      skippedCount: 0,
      calibrationSignals: ["review marked the day as overplanned", "review marked low energy"]
    });

    const plan = buildDayPlan(state);

    expect(plan.availableMinutes).toBe(225);
  });

  it("penalizes vague tasks after review-worthy partial progress", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    state.tasks = [
      {
        ...state.tasks[0],
        id: "task_vague",
        title: "Fix product stuff",
        folderId: undefined,
        type: "atomic",
        priority: 10,
        importance: 10,
        urgency: 10,
        dueDate: "2026-06-01",
        definitionOfDone: undefined
      },
      {
        ...state.tasks[0],
        id: "task_specific",
        title: "Ship password reset regression test",
        folderId: undefined,
        type: "atomic",
        priority: 7,
        importance: 7,
        urgency: 7,
        dueDate: "2026-06-03",
        definitionOfDone: "Regression test passes."
      }
    ];
    state.executionEvents.push({
      id: "event_vague",
      date: "2026-05-31",
      createdAt: "2026-05-31T17:00:00.000Z",
      type: "partially_completed",
      taskId: "task_vague",
      planItemId: "plan_2026-05-31_task_vague",
      reason: "too_vague",
      note: "Couldn't tell what done meant."
    }, {
      id: "event_vague_again",
      date: "2026-05-31",
      createdAt: "2026-05-31T18:00:00.000Z",
      type: "partially_completed",
      taskId: "task_vague",
      planItemId: "plan_2026-05-31_task_vague",
      reason: "too_vague",
      note: "Still too broad."
    });

    const plan = buildDayPlan(state);

    expect(plan.items[0]?.title).toBe("Ship password reset regression test");
  });

  it("calibrates future estimates from actual completion time", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-02";
    state.currentTime = "08:30";
    state.tasks = [
      {
        ...state.tasks[2],
        id: "task_daily_walk",
        title: "Daily walk",
        status: "active",
        repeatPolicy: { type: "daily", carryover: "skip" },
        completionBehavior: "repeatable",
        effortMinutes: 20
      }
    ];
    state.completions.push({
      id: "completion_walk",
      date: "2026-06-01",
      planItemId: "plan_2026-06-01_task_daily_walk",
      taskIds: ["task_daily_walk"],
      actualMinutes: 45
    });

    const plan = buildDayPlan(state);

    expect(plan.items.find((item) => item.title === "Daily walk")?.estimatedMinutes).toBe(45);
  });

  it("uses the clock to avoid pretending a full workday remains at night", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "19:30";

    const plan = buildDayPlan(state);

    expect(plan.availableMinutes).toBe(150);
    expect(plan.loadLevel).toBe("heavy");
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
        folderId: "domain_house",
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
        folderId: "domain_health",
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

    const plan = buildDayPlan(state);
    const sleep = plan.items.find((item) => item.title === "Sleep");
    const chores = plan.items.find((item) => item.title === "Tidy the garage");

    expect(sleep?.startTime).toBe("23:30");
    expect(chores?.status).toBe("unscheduled");
    expect(chores?.reason).toContain("Does not fit before Sleep at 23:30");
  });

  it("does not count sleep anchors or soft invitations against committed daily load", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "13:30";
    state.availableMinutes = 300;
    state.tasks = [
      {
        id: "task_work",
        title: "Focused work",
        type: "atomic",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "progress", pressureLevel: "scheduled" },
        priority: 5,
        importance: 5,
        urgency: 5,
        scheduledDate: "2026-06-01",
        effortMinutes: 120,
        energy: "medium",
        strictness: "normal"
      },
      {
        id: "task_optional",
        title: "Watch anime",
        type: "soft_invitation",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "keep_as_suggestion",
        plannerFields: { intentType: "obligation", pressureLevel: "soft" },
        priority: 1,
        importance: 1,
        urgency: 1,
        scheduledDate: "2026-06-01",
        effortMinutes: 45,
        energy: "low",
        strictness: "flexible"
      },
      {
        id: "task_sleep",
        title: "Sleep",
        type: "atomic",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "recovery", pressureLevel: "fixed" },
        priority: 5,
        importance: 5,
        urgency: 5,
        scheduledDate: "2026-06-01",
        scheduledTime: "23:45",
        effortMinutes: 480,
        energy: "low",
        strictness: "strict"
      }
    ];

    const plan = buildDayPlan(state);

    expect(plan.items.some((item) => item.title === "Sleep")).toBe(true);
    expect(plan.items.some((item) => item.title === "Watch anime")).toBe(true);
    expect(plan.estimatedTotalMinutes).toBe(120);
    expect(plan.loadLevel).toBe("light");
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
    state.tasks.push({
      id: "task_walk",
      title: "Walk",
      type: "atomic",
      folderId: "domain_health",
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

  it("shows phased background tasks as active and passive timeline phases", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    state.tasks = [
      {
        id: "task_laundry",
        title: "Do laundry",
        type: "atomic",
        folderId: "domain_house",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "progress_accumulating",
        plannerFields: { intentType: "maintenance", pressureLevel: "scheduled", location: "home", setupCost: "low" },
        priority: 4,
        importance: 4,
        urgency: 3,
        scheduledDate: "2026-06-01",
        effortMinutes: 90,
        energy: "low",
        strictness: "normal",
        scheduling: {
          mode: "phased",
          attentionLoad: "partial",
          canOverlap: true,
          overlapKinds: ["household", "passive_waiting"],
          phases: [
            { id: "start", title: "Start laundry", kind: "active", effortMinutes: 10, attentionLoad: "partial" },
            { id: "run", title: "Laundry running", kind: "passive", effortMinutes: 60, attentionLoad: "passive", canOverlap: true },
            { id: "finish", title: "Hang laundry", kind: "return", effortMinutes: 20, attentionLoad: "partial" }
          ]
        }
      }
    ];

    const plan = buildDayPlan(state);
    const passive = plan.items.find((item) => item.title === "Laundry running");

    expect(plan.items.map((item) => item.title)).toEqual(["Start laundry", "Laundry running", "Hang laundry"]);
    expect(passive).toMatchObject({
      schedulingMode: "phased",
      attentionLoad: "passive",
      blockingMinutes: 0,
      clockMinutes: 60
    });
    expect(plan.estimatedTotalMinutes).toBe(14);
  });

  it("lets passive concurrent work share clock time with partial-attention work", () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "18:00";
    state.tasks = [
      {
        id: "task_cook",
        title: "Cook dinner",
        type: "atomic",
        folderId: "domain_house",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "simple_done",
        plannerFields: { intentType: "maintenance", pressureLevel: "scheduled", location: "home", setupCost: "medium" },
        priority: 4,
        importance: 4,
        urgency: 4,
        scheduledDate: "2026-06-01",
        effortMinutes: 45,
        energy: "medium",
        strictness: "normal",
        scheduling: { mode: "concurrent", attentionLoad: "partial", canOverlap: true, overlapKinds: ["cooking", "audio"] }
      },
      {
        id: "task_ai_report",
        title: "Run AI report draft",
        type: "atomic",
        folderId: "domain_work",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "progress_accumulating",
        plannerFields: { intentType: "progress", pressureLevel: "scheduled", location: "computer", setupCost: "low" },
        priority: 3,
        importance: 4,
        urgency: 2,
        scheduledDate: "2026-06-01",
        effortMinutes: 45,
        energy: "low",
        strictness: "flexible",
        scheduling: { mode: "background", attentionLoad: "passive", canOverlap: true, overlapKinds: ["ai_running", "passive_waiting"] }
      }
    ];

    const plan = buildDayPlan(state);
    const cook = plan.items.find((item) => item.title === "Cook dinner");
    const ai = plan.items.find((item) => item.title === "Run AI report draft");

    expect(cook?.startTime).toBe("18:00");
    expect(ai?.startTime).toBe("18:00");
    expect(ai?.blockingMinutes).toBe(0);
    expect(plan.estimatedTotalMinutes).toBe(20);
  });
});
