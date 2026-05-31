import { describe, expect, it } from "vitest";
import { buildParsedActionsFromDayRewrite, fixtureInterpreter, interpretInboxInput } from "./ai-actions";
import { createSeedState } from "./seed";

describe("interpretInboxInput", () => {
  it("turns messy input into structured auto-applicable actions", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    const entry = await interpretInboxInput(
      "Need back rehab daily, clean garage this weekend, finish diet app auth bug before Friday, and message Will.",
      state,
      fixtureInterpreter
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
    const entry = await interpretInboxInput("Stuff about the thing maybe later", state, fixtureInterpreter);

    expect(entry.actions.some((action) => action.type === "ask_clarification")).toBe(true);
    expect(entry.actions.some((action) => action.safety === "needs_confirmation")).toBe(true);
  });

  it("captures rich task semantics for realistic messy inputs", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const timebox = await interpretInboxInput("work on diet app for two hours", state, fixtureInterpreter);
    expect(timebox.actions[0].payload).toMatchObject({
      title: "Work on Diet App",
      completionMode: "timebox",
      effortMinutes: 120,
      projectId: "project_diet_app"
    });

    const recurring = await interpretInboxInput("message Will every Friday", state, fixtureInterpreter);
    expect(recurring.actions[0].payload).toMatchObject({
      title: "Message Will",
      recurrence: { type: "weekly", days: [5] }
    });

    const vague = await interpretInboxInput("clean the house this weekend", state, fixtureInterpreter);
    expect(vague.actions[0].payload).toMatchObject({
      questionKind: "definition_of_done"
    });
  });

  it("normalizes live-model drift for broad cleaning clarification", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const entry = await interpretInboxInput(
      "clean the house this weekend",
      state,
      async () => ({
        model: "drift-fixture",
        summary: "Need clarification.",
        actions: [
          {
            type: "create_task",
            label: "Clean the House",
            title: "What should clean the house this weekend include?",
            domainName: "House Work",
            projectName: null,
            dueDate: "2026-06-01",
            scheduledDate: null,
            scheduledTime: ":null",
            effortMinutes: 90,
            energy: "medium",
            strictness: "flexible",
            priority: 3,
            importance: 4,
            urgency: 2,
            recurrenceDays: null,
            completionBehavior: null,
            completionMode: null,
            definitionOfDone: "What should clean the house include?",
            tags: null,
            question: null,
            clarificationKind: null,
            clarificationOptions: null
          }
        ]
      })
    );

    expect(entry.actions[0]).toMatchObject({
      type: "ask_clarification",
      label: "Clarify clean house"
    });
    expect(entry.actions[0].payload).toMatchObject({
      draftAction: { title: "Clean house" }
    });

    const clarificationEntry = await interpretInboxInput(
      "clean the house this weekend",
      state,
      async () => ({
        model: "drift-fixture",
        summary: "Need clarification.",
        actions: [
          {
            type: "ask_clarification",
            label: "Clarify what clean the house should include",
            title: "Clean the house this weekend",
            domainName: "House Work",
            projectName: null,
            dueDate: "2026-06-01",
            scheduledDate: null,
            scheduledTime: null,
            effortMinutes: 90,
            energy: "medium",
            strictness: "flexible",
            priority: 3,
            importance: 4,
            urgency: 2,
            recurrenceDays: null,
            completionBehavior: null,
            completionMode: "timebox",
            definitionOfDone: null,
            tags: null,
            question: "What should clean the house include?",
            clarificationKind: "definition_of_done",
            clarificationOptions: null
          }
        ]
      })
    );

    expect(clarificationEntry.actions[0].payload).toMatchObject({
      draftAction: { title: "Clean house", completionMode: "progress_accumulating", scheduledTime: undefined }
    });
  });

  it("suppresses low-value follow-up questions for obvious simple tasks", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const entry = await interpretInboxInput(
      "I need to cut my nails",
      state,
      async () => ({
        model: "over-questioning-fixture",
        summary: "Asking a question.",
        actions: [
          {
            type: "ask_clarification",
            label: "Clarify cut nails",
            title: "Cut nails",
            domainName: "House Work",
            projectName: null,
            dueDate: null,
            scheduledDate: null,
            scheduledTime: null,
            effortMinutes: 15,
            energy: "low",
            strictness: "flexible",
            priority: 2,
            importance: 2,
            urgency: 2,
            recurrenceDays: null,
            completionBehavior: null,
            completionMode: null,
            definitionOfDone: null,
            tags: null,
            question: "What would count as cutting your nails?",
            clarificationKind: "definition_of_done",
            clarificationOptions: ["Trim them", "File them"]
          }
        ]
      })
    );

    expect(entry.actions[0]).toMatchObject({
      type: "create_task",
      safety: "auto_apply"
    });
    expect(entry.actions[0].payload).toMatchObject({
      title: "Cut nails",
      completionMode: "simple_done"
    });
  });

  it("keeps high-value clarification questions with materiality metadata", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const entry = await interpretInboxInput(
      "clean the house this weekend",
      state,
      async () => ({
        model: "question-fixture",
        summary: "Need one detail.",
        actions: [
          {
            type: "ask_clarification",
            label: "Clarify clean house",
            title: "Clean house",
            domainName: "House Work",
            projectName: null,
            dueDate: null,
            scheduledDate: null,
            scheduledTime: null,
            effortMinutes: 90,
            energy: "medium",
            strictness: "flexible",
            priority: 3,
            importance: 4,
            urgency: 2,
            recurrenceDays: null,
            completionBehavior: "exhaust_once",
            completionMode: "progress_accumulating",
            definitionOfDone: null,
            tags: ["home"],
            question: "What would count as enough cleaning for this task?",
            clarificationKind: "definition_of_done",
            clarificationOptions: ["Kitchen and bathroom", "One focused pass"]
          }
        ]
      })
    );

    expect(entry.actions[0]).toMatchObject({
      type: "ask_clarification",
      safety: "needs_confirmation"
    });
    expect(entry.actions[0].payload).toMatchObject({
      materiality: "high",
      rationale: "The answer changes what completion means."
    });
  });

  it("keeps day, deadline, and week-window intent separate inside messy input", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const mixed = await interpretInboxInput("message Will today and book dentist sometime next week", state, fixtureInterpreter);
    const message = mixed.actions.find((action) => action.payload.title === "Message Will");
    const dentist = mixed.actions.find((action) => action.payload.title === "Book dentist");

    expect(message?.payload).toMatchObject({
      dateIntent: { kind: "today" }
    });
    expect(dentist?.payload).toMatchObject({
      scheduledDate: undefined,
      dueDate: undefined,
      dateIntent: { kind: "week_window", startDate: "2026-06-08", endDate: "2026-06-14" }
    });

    const deadline = await interpretInboxInput("finish auth bug by Tuesday", state, fixtureInterpreter);
    expect(deadline.actions[0].payload).toMatchObject({
      title: "Finish auth bug",
      dueDate: "2026-06-02",
      scheduledDate: undefined,
      dateIntent: { kind: "deadline", dueDate: "2026-06-02" }
    });

    const exactDay = await interpretInboxInput("call dentist on Tuesday", state, fixtureInterpreter);
    expect(exactDay.actions[0].payload).toMatchObject({
      title: "Call dentist",
      scheduledDate: "2026-06-02",
      dateIntent: { kind: "specific_date", scheduledDate: "2026-06-02" }
    });
  });

  it("removes invented exact dates for broad week-window wording", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-02";
    state.currentTime = "08:30";

    const entry = await interpretInboxInput(
      "text Alex today and book dentist sometime next week",
      state,
      async () => ({
        model: "drift-fixture",
        summary: "Two tasks captured.",
        actions: [
          {
            type: "create_task",
            label: "text Alex today",
            title: "Text Alex",
            domainName: "Social",
            projectName: null,
            dueDate: null,
            scheduledDate: "2026-06-02",
            scheduledTime: null,
            effortMinutes: 10,
            energy: "low",
            strictness: "normal",
            priority: 3,
            importance: 3,
            urgency: 4,
            recurrenceDays: null,
            completionBehavior: "exhaust_once",
            completionMode: "simple_done",
            definitionOfDone: null,
            tags: null,
            question: null,
            clarificationKind: null,
            clarificationOptions: null
          },
          {
            type: "create_task",
            label: "book dentist sometime next week",
            title: "Book dentist appointment",
            domainName: "Health",
            projectName: null,
            dueDate: null,
            scheduledDate: "2026-06-09",
            scheduledTime: null,
            effortMinutes: 15,
            energy: "low",
            strictness: "normal",
            priority: 3,
            importance: 4,
            urgency: 2,
            recurrenceDays: null,
            completionBehavior: "exhaust_once",
            completionMode: "simple_done",
            definitionOfDone: null,
            tags: null,
            question: null,
            clarificationKind: null,
            clarificationOptions: null
          }
        ]
      })
    );

    const dentist = entry.actions.find((action) => /dentist/i.test(String(action.payload.title)));
    expect(dentist?.payload).toMatchObject({
      scheduledDate: undefined,
      dueDate: undefined,
      dateIntent: { kind: "week_window", startDate: "2026-06-08", endDate: "2026-06-14" }
    });
  });

  it("infers phased and concurrent scheduling semantics from natural wording", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    const laundry = await interpretInboxInput("I need to do laundry today with the washer running in the background", state, fixtureInterpreter);
    expect(laundry.actions[0].payload).toMatchObject({
      title: "Do laundry",
      scheduling: {
        mode: "phased",
        attentionLoad: "partial",
        canOverlap: true
      }
    });
    expect((laundry.actions[0].payload.scheduling as { phases: unknown[] }).phases.length).toBeGreaterThanOrEqual(3);

    const overlap = await interpretInboxInput("AI can run the report while I cook dinner tonight", state, fixtureInterpreter);
    const dinner = overlap.actions.find((action) => action.payload.title === "Cook dinner");
    const report = overlap.actions.find((action) => action.payload.title === "Run AI report draft");

    expect(dinner?.payload).toMatchObject({
      scheduling: { mode: "concurrent", attentionLoad: "partial", canOverlap: true }
    });
    expect(report?.payload).toMatchObject({
      scheduling: { mode: "background", attentionLoad: "passive", canOverlap: true }
    });
  });

  it("diffs a simple model-rewritten day into edit actions without semantic second-guessing", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";
    const task = state.tasks.find((candidate) => candidate.title === "Message Will");

    const entry = await interpretInboxInput("move message Will to 17:00 and add clean house at 16:00", state, async () =>
      buildParsedActionsFromDayRewrite(
        {
          summary: "Rewrote the day.",
          changePlan: ["Move Message Will to 17:00.", "Add Clean house at 16:00."],
          question: null,
          archivedTaskIds: [],
          revisedDay: [
            {
              taskId: task!.id,
              title: "Message Will",
              startTime: "17:00",
              effortMinutes: task!.effortMinutes,
              note: null
            },
            {
              taskId: null,
              title: "Clean house",
              startTime: "16:00",
              effortMinutes: 45,
              note: "Do a focused cleaning pass."
            }
          ]
        },
        state
      )
    );

    expect(entry.actions.map((action) => action.type)).toEqual(["schedule_task", "create_task"]);
    expect(entry.actions[0]).toMatchObject({
      type: "schedule_task",
      safety: "auto_apply",
      payload: { taskId: task!.id, scheduledDate: "2026-06-01", scheduledTime: "17:00" }
    });
    expect(entry.actions[1]).toMatchObject({
      type: "create_task",
      safety: "auto_apply",
      payload: { title: "Clean house", scheduledDate: "2026-06-01", scheduledTime: "16:00" }
    });
  });

  it("keeps interpreter debug traces on the inbox entry", async () => {
    const state = createSeedState();
    const entry = await interpretInboxInput("I need to cut my nails", state, async (input) => ({
      ...(await fixtureInterpreter(input, state)),
      debugTrace: {
        calls: [
          {
            label: "Fixture call",
            model: "fixture",
            createdAt: "2026-06-01T08:30:00.000Z",
            instructions: "Test instructions",
            input,
            response: "{\"summary\":\"ok\"}",
            parsedResponse: { summary: "ok" }
          }
        ]
      }
    }));

    expect(entry.debugTrace?.calls[0]).toMatchObject({
      label: "Fixture call",
      instructions: "Test instructions",
      response: "{\"summary\":\"ok\"}"
    });
  });
});
