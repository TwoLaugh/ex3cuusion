import { describe, expect, it } from "vitest";
import { fixtureInterpreter, interpretInboxInput } from "./ai-actions";
import { createSeedState } from "./seed";

// The fixture interpreter is a deterministic TEST DOUBLE for exercising the
// state/plumbing pipeline offline. It is not a model-quality signal and its canned
// answers must never be mirrored by production interpretation code. Model-quality
// behavior is covered by the live eval set (npm run eval:ai:live).
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

  it("compiles model-chosen fields into the right action payloads (plumbing)", async () => {
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

    const clarify = await interpretInboxInput("clean the house this weekend", state, fixtureInterpreter);
    expect(clarify.actions[0].payload).toMatchObject({
      questionKind: "definition_of_done"
    });
  });

  it("passes the model's clarification decision through without phrase-based override", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    // Even for an "obvious" chore, if the model decides to ask, we keep the question.
    // Deterministic code must not downgrade it to a silent create_task.
    const entry = await interpretInboxInput("I need to cut my nails", state, async () => ({
      model: "model-decides",
      summary: "Need one detail.",
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
          effortMinutes: 10,
          energy: "low",
          strictness: "normal",
          priority: 2,
          importance: 2,
          urgency: 2,
          recurrenceDays: null,
          completionBehavior: null,
          completionMode: null,
          definitionOfDone: null,
          tags: null,
          question: "Trim or file?",
          clarificationKind: "next_action",
          clarificationOptions: ["Trim", "File"]
        }
      ]
    }));

    expect(entry.actions[0].type).toBe("ask_clarification");
    expect(entry.actions[0].safety).toBe("needs_confirmation");
  });

  it("creates the task the model chose instead of forcing a phrase-based clarification", async () => {
    const state = createSeedState();
    state.currentDate = "2026-06-01";
    state.currentTime = "08:30";

    // The model returns a concrete task for a phrase that used to be hard-coded into a
    // "definition_of_done" clarification. We must respect the model's choice.
    const entry = await interpretInboxInput("clean the house this weekend", state, async () => ({
      model: "model-decides",
      summary: "Created the cleaning task.",
      actions: [
        {
          type: "create_task",
          label: "Add clean the house",
          title: "Clean the house",
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
          definitionOfDone: "Kitchen, bathroom, and living room are tidy.",
          tags: null,
          question: null,
          clarificationKind: null,
          clarificationOptions: null
        }
      ]
    }));

    expect(entry.actions[0].type).toBe("create_task");
    expect(entry.actions[0].payload).toMatchObject({
      title: "Clean the house",
      completionMode: "progress_accumulating"
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
