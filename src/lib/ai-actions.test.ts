import { describe, expect, it } from "vitest";
import { fixtureInterpreter, interpretInboxInput } from "./ai-actions";
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
});
