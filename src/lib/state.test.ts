import { beforeEach, describe, expect, it } from "vitest";
import { fixtureInterpreter } from "./ai-actions";
import { buildDayPlan } from "./planner";
import {
  advanceDay,
  answerCaptureQuestion,
  completePlanItem,
  confirmAiAction,
  deferPlanItem,
  getState,
  recordPlanItemOutcome,
  rejectAiAction,
  resetState,
  retreatDay,
  setClock,
  submitInbox
} from "./state";

describe("state integration", () => {
  beforeEach(() => {
    resetState();
    setClock("2026-06-01", "08:30");
  });

  it("applies inbox actions and updates the plan", async () => {
    const before = getState();
    const beforeCount = before.tasks.length;

    const after = await submitInbox("message Will and clean garage this weekend", fixtureInterpreter);
    const plan = buildDayPlan(after);

    expect(after.tasks.length).toBe(beforeCount);
    expect(after.inbox[0].actions.every((action) => action.status === "applied")).toBe(true);
    expect(after.inbox[0].actions.some((action) => action.skippedReason === "Task already exists.")).toBe(true);
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
    expect(state.executionEvents.some((event) => event.type === "deferred" && event.planItemId === project!.id)).toBe(true);
  });

  it("completes linked atomic tasks and selected project subtasks", () => {
    const plan = buildDayPlan(getState());
    const message = plan.items.find((item) => item.title === "Message Will");
    const project = plan.items.find((item) => item.title === "Diet App");

    completePlanItem(message!.id);
    expect(getState().tasks.find((task) => task.id === message!.taskId)?.status).toBe("completed");
    expect(buildDayPlan(getState()).items.find((item) => item.title === "Message Will")?.status).toBe("completed");

    const selected = project!.selectedTaskIds ?? [];
    completePlanItem(project!.id, undefined, [selected[0]]);
    expect(getState().tasks.find((task) => task.id === selected[0])?.status).toBe("completed");
    expect(buildDayPlan(getState()).items.find((item) => item.id === project!.id)?.status).toBe("planned");
    expect(buildDayPlan(getState()).items.find((item) => item.id === project!.id)?.selectedTaskIds).toContain(selected[0]);

    completePlanItem(project!.id, undefined, selected.slice(1));
    expect(getState().tasks.filter((task) => selected.includes(task.id)).every((task) => task.status === "completed")).toBe(true);
    expect(buildDayPlan(getState()).items.find((item) => item.id === project!.id)?.status).toBe("completed");
  });

  it("completion events do not exhaust repeatable suggestions", () => {
    setClock("2026-06-03", "08:30");
    const plan = buildDayPlan(getState());
    const suggestion = plan.items.find((item) => item.title === "Read together");

    expect(suggestion?.section).toBe("soft_invitations");
    completePlanItem(suggestion!.id, 40);

    const state = getState();
    const task = state.tasks.find((entry) => entry.id === suggestion!.taskId);
    const updatedPlan = buildDayPlan(state);

    expect(task?.status).toBe("active");
    expect(task?.lastCompletedAt).toBeDefined();
    expect(updatedPlan.items.find((item) => item.id === suggestion!.id)?.status).toBe("completed");
  });

  it("records partial progress without completing the task", () => {
    const plan = buildDayPlan(getState());
    const project = plan.items.find((item) => item.title === "Diet App");
    const firstTaskId = project!.selectedTaskIds![0];

    recordPlanItemOutcome({
      planItemId: project!.id,
      type: "partially_completed",
      reason: "did_part",
      note: "Found the auth redirect issue.",
      actualMinutes: 35,
      nextAction: "Add regression test"
    });

    const state = getState();
    expect(state.tasks.find((task) => task.id === firstTaskId)?.status).toBe("active");
    expect(state.executionEvents.some((event) => event.type === "partially_completed" && event.actualMinutes === 35)).toBe(true);
  });

  it("turns blocked and waiting outcomes into task state the planner respects", () => {
    const plan = buildDayPlan(getState());
    const message = plan.items.find((item) => item.title === "Message Will");

    recordPlanItemOutcome({
      planItemId: message!.id,
      type: "blocked",
      reason: "blocked",
      note: "Need phone number.",
      blocked: { blockedBy: "missing_info", note: "Need phone number." }
    });

    let state = getState();
    expect(state.tasks.find((task) => task.id === message!.taskId)?.status).toBe("blocked");
    expect(buildDayPlan(state).items.find((item) => item.taskId === message!.taskId)?.status).toBe("deferred");
    advanceDay();
    expect(buildDayPlan(getState()).items.some((item) => item.taskId === message!.taskId)).toBe(false);

    resetState();
    setClock("2026-06-01", "08:30");
    const freshMessage = buildDayPlan(getState()).items.find((item) => item.title === "Message Will");
    recordPlanItemOutcome({
      planItemId: freshMessage!.id,
      type: "blocked",
      reason: "blocked",
      blocked: { blockedBy: "missing_info", unblockAction: "Find Will's number" }
    });

    expect(buildDayPlan(getState()).items.some((item) => item.title.startsWith("Unblock: Message Will"))).toBe(true);

    resetState();
    setClock("2026-06-01", "08:30");
    const waitingMessage = buildDayPlan(getState()).items.find((item) => item.title === "Message Will");
    recordPlanItemOutcome({
      planItemId: waitingMessage!.id,
      type: "waiting_on",
      reason: "waiting_on",
      waiting: { waitingOn: "Will", followUpDate: "2026-06-01" }
    });

    expect(getState().tasks.find((task) => task.id === waitingMessage!.taskId)?.status).toBe("waiting");
    expect(buildDayPlan(getState()).items.some((item) => item.title.startsWith("Follow up: Message Will"))).toBe(true);
  });

  it("keeps confirmation-required AI actions pending until explicit decision", async () => {
    const after = await submitInbox("Stuff about the thing maybe later", fixtureInterpreter);
    const action = after.inbox[0].actions[0];

    expect(action.status).toBe("proposed");
    expect(action.safety).toBe("needs_confirmation");

    rejectAiAction(action.id, "Too vague.");
    expect(getState().inbox[0].actions[0].status).toBe("rejected");

    await submitInbox("Add a task called Water plants today for 10 minutes.", fixtureInterpreter);
    const applied = getState().inbox[0].actions[0];
    expect(applied.status).toBe("applied");
    confirmAiAction(applied.id);
    expect(getState().inbox[0].actions[0].status).toBe("applied");
  });

  it("creates capture sessions and applies clarification answers to pending draft actions", async () => {
    const afterCapture = await submitInbox("clean the house this weekend", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const question = session.questions[0];

    expect(session.status).toBe("waiting_for_user");
    expect(question.kind).toBe("definition_of_done");
    expect(afterCapture.inbox[0].actions[0].type).toBe("ask_clarification");

    const afterAnswer = answerCaptureQuestion(session.id, question.id, "Kitchen and bathroom are clean enough.");
    const created = afterAnswer.tasks.find((task) => task.title === "Clean house");

    expect(created?.definitionOfDone).toBe("Kitchen and bathroom are clean enough.");
    expect(created?.completionMode).toBe("progress_accumulating");
    expect(afterAnswer.captureSessions[0].status).toBe("applied");
    expect(afterAnswer.inbox[0].actions.some((action) => action.type === "create_task" && action.status === "applied")).toBe(true);
  });

  it("does not ask annoying clarification for obvious simple tasks", async () => {
    const after = await submitInbox("I need to cut my nails", fixtureInterpreter);
    const task = after.tasks.find((candidate) => candidate.title === "Cut nails");

    expect(after.captureSessions[0].questions).toHaveLength(0);
    expect(task?.completionMode).toBe("simple_done");
    expect(task?.status).toBe("active");
  });

  it("structures reusable relationship ideas through clarification", async () => {
    const afterCapture = await submitInbox("ideas for things to do with Emma", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const question = session.questions[0];

    expect(question.kind).toBe("completion_behavior");

    const afterAnswer = answerCaptureQuestion(session.id, question.id, "Reusable suggestion");
    const idea = afterAnswer.tasks.find((task) => task.title === "Ideas for things to do with Emma");

    expect(idea?.projectId).toBe("container_emma");
    expect(idea?.completionBehavior).toBe("keep_as_suggestion");
    expect(idea?.completionMode).toBe("suggestion_used");
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
