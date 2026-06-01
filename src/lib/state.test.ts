import { beforeEach, describe, expect, it } from "vitest";
import { fixtureInterpreter } from "./ai-actions";
import { buildDayPlan } from "./planner";
import {
  addCaptureSessionMessage,
  advanceDay,
  answerCaptureQuestion,
  applyStructureMutation,
  completePlanItem,
  confirmAiAction,
  dailyReviewSummary,
  deferPlanItem,
  getState,
  listChangeHistory,
  maybeRunDailyOrganizer,
  recordPlanItemOutcome,
  rejectAiAction,
  resetState,
  runOrganizerPass,
  setAutoOrganizeEnabled,
  undoChange,
  retreatDay,
  setClock,
  submitInbox,
  submitDailyReview,
  updateProjectBlockSelection
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

  it("groups multiple related tasks under a work block created in the same message (T062)", async () => {
    const base = {
      targetTaskId: null,
      domainName: "Job Work",
      projectName: null as string | null,
      dueDate: null,
      scheduledDate: null,
      scheduledTime: null,
      effortMinutes: 30,
      energy: "medium" as const,
      strictness: "normal" as const,
      priority: 3,
      importance: 3,
      urgency: 3,
      recurrenceDays: null,
      completionBehavior: null,
      completionMode: null,
      definitionOfDone: null,
      tags: null,
      question: null,
      clarificationKind: null,
      clarificationOptions: null,
      schedulingMode: null,
      dateIntent: null
    };
    const after = await submitInbox("launch prep: write copy, design banner", async () => ({
      model: "grouping-fixture",
      summary: "Grouped under Launch Prep.",
      actions: [
        { ...base, type: "create_project" as const, label: "Create Launch Prep", title: "Launch Prep" },
        { ...base, type: "create_task" as const, label: "Add Write copy", title: "Write copy", projectName: "Launch Prep" },
        { ...base, type: "create_task" as const, label: "Add Design banner", title: "Design banner", projectName: "Launch Prep" }
      ]
    }));

    const project = after.projects.find((candidate) => candidate.name === "Launch Prep");
    expect(project).toBeDefined();
    const copy = after.tasks.find((task) => task.title === "Write copy");
    const banner = after.tasks.find((task) => task.title === "Design banner");
    expect(copy?.projectId).toBe(project!.id);
    expect(banner?.projectId).toBe(project!.id);
  });

  it("reprioritizes and demotes an existing task to someday (T064 update_task)", async () => {
    const seed = getState();
    const target = seed.tasks.find((task) => task.status !== "archived");
    expect(target).toBeDefined();

    const after = await submitInbox(`push ${target!.title} to someday`, async () => ({
      model: "groom-fixture",
      summary: "Demoted to someday.",
      actions: [
        {
          type: "update_task" as const,
          label: `Demote ${target!.title}`,
          title: target!.title,
          targetTaskId: target!.id,
          domainName: "Job Work",
          projectName: null,
          dueDate: null,
          scheduledDate: null,
          scheduledTime: null,
          effortMinutes: 30,
          energy: "low" as const,
          strictness: "flexible" as const,
          priority: 2,
          importance: 2,
          urgency: 1,
          recurrenceDays: null,
          completionBehavior: null,
          completionMode: null,
          definitionOfDone: null,
          tags: null,
          question: null,
          clarificationKind: null,
          clarificationOptions: null,
          schedulingMode: null,
          dateIntent: "someday" as const
        }
      ]
    }));

    const updated = after.tasks.find((task) => task.id === target!.id);
    expect(updated?.scheduledDate).toBeUndefined();
    expect(updated?.plannerFields.pressureLevel).toBe("someday");
    expect(updated?.urgency).toBe(1);
  });

  it("manually promotes and demotes a task via dateIntentKind (T072)", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Groom me", scheduledDate: "2026-06-01" } });
    const id = getState().tasks.find((task) => task.title === "Groom me")!.id;

    applyStructureMutation({ entity: "task", action: "update", id, patch: { dateIntentKind: "someday" } });
    let task = getState().tasks.find((entry) => entry.id === id)!;
    expect(task.scheduledDate).toBeUndefined();
    expect(task.dateIntent?.kind).toBe("someday");
    expect(task.plannerFields.pressureLevel).toBe("someday");

    applyStructureMutation({ entity: "task", action: "update", id, patch: { dateIntentKind: "today" } });
    task = getState().tasks.find((entry) => entry.id === id)!;
    expect(task.scheduledDate).toBe("2026-06-01");
    expect(task.dateIntent?.kind).toBe("today");
  });

  it("nests a subtask under a parent and treats the parent as a container (T071)", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Parent task", scheduledDate: "2026-06-01" } });
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Child task", scheduledDate: "2026-06-01" } });
    const parent = getState().tasks.find((task) => task.title === "Parent task")!;
    const child = getState().tasks.find((task) => task.title === "Child task")!;

    applyStructureMutation({ entity: "task", action: "update", id: child.id, patch: { parentTaskId: parent.id } });
    expect(getState().tasks.find((task) => task.id === child.id)?.parentTaskId).toBe(parent.id);

    // Parent with an active child is excluded from the day plan (container); child still plans.
    const plan = buildDayPlan(getState());
    const titles = plan.items.flatMap((item) => [item.title, ...(item.selectedTaskIds ?? [])]);
    expect(plan.items.some((item) => item.title === "Parent task")).toBe(false);
    expect(plan.items.some((item) => item.title === "Child task")).toBe(true);

    // Single-level guard: the parent (which has a child) cannot itself become a subtask.
    applyStructureMutation({ entity: "task", action: "update", id: parent.id, patch: { parentTaskId: child.id } });
    expect(getState().tasks.find((task) => task.id === parent.id)?.parentTaskId).toBeUndefined();
  });

  it("manually sets tags, overlap mode, and min/max minutes on a task (T070)", async () => {
    const target = getState().tasks.find((task) => task.status !== "archived")!;
    applyStructureMutation({
      entity: "task",
      action: "update",
      id: target.id,
      patch: { tags: ["focus", "deep-work"], schedulingMode: "background", minMinutes: 20, maxMinutes: 90, energy: "high", strictness: "strict" }
    });
    const updated = getState().tasks.find((task) => task.id === target.id);
    expect(updated?.tags).toEqual(["focus", "deep-work"]);
    expect(updated?.scheduling?.mode).toBe("background");
    expect(updated?.scheduling?.canOverlap).toBe(true);
    expect(updated?.minMinutes).toBe(20);
    expect(updated?.maxMinutes).toBe(90);
    expect(updated?.energy).toBe("high");
    expect(updated?.strictness).toBe("strict");
  });

  it("organizer archives duplicate tasks as one undoable pass (T066)", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Duplicate me" } });
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Duplicate me" } });
    const liveBefore = getState().tasks.filter((task) => task.title === "Duplicate me" && task.status !== "archived").length;
    expect(liveBefore).toBe(2);

    await runOrganizerPass();

    const liveAfter = getState().tasks.filter((task) => task.title === "Duplicate me" && task.status !== "archived").length;
    expect(liveAfter).toBe(1);
    expect(listChangeHistory()[0].source).toBe("organizer");
  });

  it("respects the auto-organizer enable/disable setting (T074)", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Dup x" } });
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Dup x" } });

    setAutoOrganizeEnabled(false);
    await maybeRunDailyOrganizer();
    expect(getState().tasks.filter((task) => task.title === "Dup x" && task.status !== "archived").length).toBe(2);

    setAutoOrganizeEnabled(true);
    await maybeRunDailyOrganizer();
    expect(getState().tasks.filter((task) => task.title === "Dup x" && task.status !== "archived").length).toBe(1);
  });

  it("auto organizer runs once per day then no-ops (T069)", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Dup once" } });
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Dup once" } });

    await maybeRunDailyOrganizer();
    expect(getState().tasks.filter((task) => task.title === "Dup once" && task.status !== "archived").length).toBe(1);
    expect(getState().lastAutoOrganizeDate).toBe("2026-06-01");

    const historyLen = listChangeHistory().length;
    await maybeRunDailyOrganizer(); // same day -> no-op
    expect(listChangeHistory().length).toBe(historyLen);
  });

  it("records and undoes manual edits and completions, not just AI actions (T073)", async () => {
    const target = getState().tasks.find((task) => task.status !== "archived")!;
    const originalTitle = target.title;

    applyStructureMutation({ entity: "task", action: "update", id: target.id, patch: { title: "Renamed by hand" } });
    expect(getState().tasks.find((task) => task.id === target.id)?.title).toBe("Renamed by hand");
    expect(listChangeHistory()[0].source).toBe("manual_edit");

    undoChange();
    expect(getState().tasks.find((task) => task.id === target.id)?.title).toBe(originalTitle);
  });

  it("records AI changes and undoes them (auto-apply with undo)", async () => {
    const before = getState();
    const beforeTaskCount = before.tasks.length;
    const beforeInboxCount = before.inbox.length;

    await submitInbox("water plants", fixtureInterpreter);
    const after = getState();
    expect(after.tasks.some((task) => task.title === "Water plants")).toBe(true);
    expect(after.tasks.length).toBe(beforeTaskCount + 1);

    const history = listChangeHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].source).toBe("inbox");

    const restored = undoChange();
    expect(restored.tasks.some((task) => task.title === "Water plants")).toBe(false);
    expect(restored.tasks.length).toBe(beforeTaskCount);
    expect(restored.inbox.length).toBe(beforeInboxCount);
    expect(listChangeHistory().length).toBe(history.length - 1);
  });

  it("manually creates, edits, moves, and archives structure", () => {
    applyStructureMutation({ entity: "domain", action: "create", patch: { name: "Manual Domain", weight: 6 } });
    let state = getState();
    const domain = state.domains.find((entry) => entry.name === "Manual Domain");
    expect(domain).toBeDefined();

    applyStructureMutation({
      entity: "project",
      action: "create",
      patch: { name: "Manual Project", domainId: domain!.id, kind: "project", planningMode: "open_backlog", defaultBlockMinutes: 45 }
    });
    state = getState();
    const project = state.projects.find((entry) => entry.name === "Manual Project");
    expect(project).toMatchObject({ domainId: domain!.id, status: "active" });

    applyStructureMutation({
      entity: "task",
      action: "create",
      patch: { title: "Manual task", domainId: domain!.id, projectId: project!.id, effortMinutes: 35, dueDate: "2026-06-04" }
    });
    state = getState();
    const task = state.tasks.find((entry) => entry.title === "Manual task");
    expect(task).toMatchObject({ projectId: project!.id, domainId: domain!.id, type: "project_task", effortMinutes: 35 });

    applyStructureMutation({
      entity: "task",
      action: "update",
      id: task!.id,
      patch: { title: "Manual task corrected", projectId: "", effortMinutes: 20, completionBehavior: "keep_as_suggestion" }
    });
    state = getState();
    expect(state.tasks.find((entry) => entry.id === task!.id)).toMatchObject({
      title: "Manual task corrected",
      projectId: undefined,
      type: "atomic",
      effortMinutes: 20,
      completionBehavior: "keep_as_suggestion"
    });

    applyStructureMutation({ entity: "routine", action: "create", patch: { title: "Manual routine", domainId: domain!.id, defaultEffortMinutes: 12 } });
    state = getState();
    const routine = state.routines.find((entry) => entry.title === "Manual routine");
    expect(routine).toMatchObject({ active: true, defaultEffortMinutes: 12 });

    applyStructureMutation({ entity: "task", action: "archive", id: task!.id });
    applyStructureMutation({ entity: "project", action: "archive", id: project!.id });
    applyStructureMutation({ entity: "routine", action: "archive", id: routine!.id });
    state = getState();
    expect(state.tasks.find((entry) => entry.id === task!.id)?.status).toBe("archived");
    expect(state.projects.find((entry) => entry.id === project!.id)?.status).toBe("paused");
    expect(state.routines.find((entry) => entry.id === routine!.id)?.active).toBe(false);
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

  it("lets project block selection change without completing child tasks", () => {
    let plan = buildDayPlan(getState());
    let project = plan.items.find((item) => item.title === "Diet App");
    const originalSelected = project!.selectedTaskIds ?? [];
    expect(originalSelected).toContain("task_auth_bug");

    updateProjectBlockSelection({ planItemId: project!.id, action: "remove", taskId: "task_auth_bug" });
    plan = buildDayPlan(getState());
    project = plan.items.find((item) => item.title === "Diet App");
    expect(project!.selectedTaskIds).not.toContain("task_auth_bug");

    updateProjectBlockSelection({ planItemId: project!.id, action: "add", taskId: "task_auth_bug" });
    plan = buildDayPlan(getState());
    project = plan.items.find((item) => item.title === "Diet App");
    expect(project!.selectedTaskIds).toContain("task_auth_bug");

    completePlanItem(project!.id);
    const state = getState();
    expect(state.tasks.filter((task) => project!.selectedTaskIds!.includes(task.id)).every((task) => task.status === "active")).toBe(true);
    expect(buildDayPlan(state).items.find((item) => item.id === project!.id)?.status).toBe("completed");

    completePlanItem(project!.id);
    expect(buildDayPlan(getState()).items.find((item) => item.id === project!.id)?.status).toBe("planned");

    updateProjectBlockSelection({ planItemId: project!.id, action: "regenerate" });
    expect(getState().projectBlockSelections).toEqual([]);
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

  it("summarizes and stores a compact daily review for planner calibration", () => {
    const plan = buildDayPlan(getState());
    const routine = plan.items.find((item) => item.title === "Back rehab");
    const project = plan.items.find((item) => item.title === "Diet App");
    const message = plan.items.find((item) => item.title === "Message Will");

    completePlanItem(routine!.id, 25);
    recordPlanItemOutcome({
      planItemId: project!.id,
      type: "partially_completed",
      reason: "too_vague",
      note: "Need a sharper next action."
    });
    deferPlanItem(message!.id, "no_time");

    const summary = dailyReviewSummary();
    expect(summary).toMatchObject({ completedCount: 1, partialCount: 1, deferredCount: 1 });
    expect(summary.calibrationSignals.some((signal) => signal.includes("time/load"))).toBe(true);

    submitDailyReview({
      energy: "low",
      planFit: "overplanned",
      note: "Too much hard-focus work.",
      affectPlanning: true
    });

    const review = getState().dailyReviews[0];
    expect(review).toMatchObject({
      date: "2026-06-01",
      energy: "low",
      planFit: "overplanned",
      completedCount: 1,
      partialCount: 1,
      deferredCount: 1
    });
    expect(review.capacityAdjustmentMinutes).toBeLessThan(0);
    expect(review.note).toBe("Too much hard-focus work.");
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
    expect(question.materiality).toBe("high");
    expect(session.draftActionIds).toContain(afterCapture.inbox[0].actions[0].id);
    expect(session.messages.some((message) => message.role === "assistant" && message.content === question.question)).toBe(true);
    expect(afterCapture.inbox[0].actions[0].type).toBe("ask_clarification");

    const afterAnswer = answerCaptureQuestion(session.id, question.id, "Kitchen and bathroom are clean enough.");
    const created = afterAnswer.tasks.find((task) => task.title === "Clean house");

    expect(created?.definitionOfDone).toBe("Kitchen and bathroom are clean enough.");
    expect(created?.completionMode).toBe("progress_accumulating");
    expect(afterAnswer.captureSessions[0].status).toBe("applied");
    expect(afterAnswer.captureSessions[0].answeredFields).toContain("definition_of_done");
    expect(afterAnswer.captureSessions[0].appliedEntityIds).toContain(created?.id);
    expect(afterAnswer.captureSessions[0].revisionEvents[0]).toMatchObject({
      source: "clarification_answer",
      taskId: created?.id,
      changes: ["answered definition_of_done"]
    });
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

  it("applies follow-up messages to the existing capture task without duplicating it", async () => {
    const afterCapture = await submitInbox("Add a task called Water plants today for 10 minutes.", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const task = afterCapture.tasks.find((candidate) => candidate.title === "Water plants");

    expect(task).toBeDefined();

    const afterFollowUp = await addCaptureSessionMessage(session.id, "actually make that next week and put it under Diet App");
    const afterSecondFollowUp = await addCaptureSessionMessage(session.id, "actually tomorrow is better");
    const updated = afterSecondFollowUp.tasks.find((candidate) => candidate.id === task!.id);

    expect(afterSecondFollowUp.tasks.filter((candidate) => candidate.title === "Water plants")).toHaveLength(1);
    expect(updated?.projectId).toBe("project_diet_app");
    expect(updated?.dateIntent?.kind).toBe("tomorrow");
    expect(updated?.scheduledDate).toBe("2026-06-02");
    expect(afterSecondFollowUp.captureSessions[0].appliedEntityIds).toEqual([task!.id]);
    expect(afterSecondFollowUp.captureSessions[0].revisionEvents).toHaveLength(2);
    expect(afterSecondFollowUp.captureSessions[0].revisionEvents[0]).toMatchObject({
      source: "follow_up",
      taskId: task!.id,
      before: { scheduledDate: "2026-06-01" },
      after: { projectId: "project_diet_app", dateIntent: { kind: "week_window" } }
    });
    expect(afterSecondFollowUp.captureSessions[0].revisionEvents[1]).toMatchObject({
      source: "follow_up",
      before: { dateIntent: { kind: "week_window" } },
      after: { scheduledDate: "2026-06-02", dateIntent: { kind: "tomorrow" } }
    });
    expect(afterFollowUp.captureSessions[0].messages.some((message) => /Updated Water plants/.test(message.content))).toBe(true);
  });

  it("applies follow-up clock-time corrections to the existing task", async () => {
    const afterCapture = await submitInbox("Add a task called Water plants today for 10 minutes.", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const task = afterCapture.tasks.find((candidate) => candidate.title === "Water plants");

    const afterFollowUp = await addCaptureSessionMessage(session.id, "actually at 5pm");
    const updated = afterFollowUp.tasks.find((candidate) => candidate.id === task!.id);

    expect(afterFollowUp.tasks.filter((candidate) => candidate.title === "Water plants")).toHaveLength(1);
    expect(updated?.scheduledDate).toBe("2026-06-01");
    expect(updated?.scheduledTime).toBe("17:00");
    expect(afterFollowUp.captureSessions[0].revisionEvents[0]).toMatchObject({
      taskId: task!.id,
      after: { scheduledTime: "17:00" }
    });
  });

  it("uses explicit inbox remove and reschedule requests to mutate existing tasks", async () => {
    const afterCapture = await submitInbox("I need to cut my nails", fixtureInterpreter);
    const task = afterCapture.tasks.find((candidate) => candidate.title === "Cut nails");

    expect(task).toBeDefined();

    const afterMove = await submitInbox("actually cut nails at 5pm", async () => ({
      model: "model-owned-edit-fixture",
      summary: "Moved the existing cut nails task.",
      actions: [
        {
          type: "schedule_task",
          label: "Move Cut nails",
          title: "Cut nails",
          targetTaskId: task!.id,
          domainName: "House Work",
          projectName: null,
          dueDate: null,
          scheduledDate: "2026-06-01",
          scheduledTime: "17:00",
          effortMinutes: 10,
          energy: "low",
          strictness: "normal",
          priority: 2,
          importance: 2,
          urgency: 2,
          recurrenceDays: null,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          definitionOfDone: null,
          tags: ["personal"],
          question: null,
          clarificationKind: null,
          clarificationOptions: null,
          schedulingMode: null,
          dateIntent: null
        }
      ]
    }));
    const moved = afterMove.tasks.find((candidate) => candidate.id === task!.id);

    expect(afterMove.tasks.filter((candidate) => candidate.title === "Cut nails")).toHaveLength(1);
    expect(moved?.scheduledDate).toBe("2026-06-01");
    expect(moved?.scheduledTime).toBe("17:00");
    expect(afterMove.inbox[0].actions[0]).toMatchObject({
      type: "schedule_task",
      status: "applied",
      appliedEntityId: task!.id
    });

    const afterRemove = await submitInbox("remove cut nails", async () => ({
      model: "model-owned-edit-fixture",
      summary: "Removed the existing cut nails task.",
      actions: [
        {
          type: "archive_task",
          label: "Remove Cut nails",
          title: "Cut nails",
          targetTaskId: task!.id,
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
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          definitionOfDone: null,
          tags: ["personal"],
          question: null,
          clarificationKind: null,
          clarificationOptions: null,
          schedulingMode: null,
          dateIntent: null
        }
      ]
    }));
    expect(afterRemove.tasks.find((candidate) => candidate.id === task!.id)?.status).toBe("archived");
    expect(afterRemove.inbox[0].actions[0]).toMatchObject({
      type: "archive_task",
      status: "applied",
      appliedEntityId: task!.id
    });
  });

  it("archives duplicate tasks when the inbox asks to keep only one matching task", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Make dump run", domainId: "domain_house", effortMinutes: 60, priority: 2 } });
    applyStructureMutation({
      entity: "task",
      action: "create",
      patch: { title: "Go to the dump", domainId: "domain_house", effortMinutes: 60, priority: 5, scheduledDate: "2026-06-01", scheduledTime: "17:00" }
    });
    const before = getState();
    const oldTask = before.tasks.find((task) => task.title === "Make dump run");
    const keepTask = before.tasks.find((task) => task.title === "Go to the dump");

    const after = await submitInbox("there is a duplicate dump item, should only be one dump thing", async () => ({
      model: "model-owned-edit-fixture",
      summary: "Removed the older duplicate dump task.",
      actions: [
        {
          type: "archive_task",
          label: "Archive duplicate Make dump run",
          title: "Make dump run",
          targetTaskId: oldTask!.id,
          domainName: "House Work",
          projectName: null,
          dueDate: null,
          scheduledDate: null,
          scheduledTime: null,
          effortMinutes: 60,
          energy: "medium",
          strictness: "normal",
          priority: 2,
          importance: 2,
          urgency: 2,
          recurrenceDays: null,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          definitionOfDone: null,
          tags: ["duplicate"],
          question: null,
          clarificationKind: null,
          clarificationOptions: null,
          schedulingMode: null,
          dateIntent: null
        }
      ]
    }));

    expect(after.tasks.find((task) => task.id === keepTask!.id)?.status).toBe("active");
    expect(after.tasks.find((task) => task.id === oldTask!.id)?.status).toBe("archived");
    expect(after.inbox[0].actions).toHaveLength(1);
    expect(after.inbox[0].actions[0]).toMatchObject({
      type: "archive_task",
      status: "applied",
      appliedEntityId: oldTask!.id
    });
  });

  it("archives original duplicate tasks from capture follow-up messages", async () => {
    applyStructureMutation({ entity: "task", action: "create", patch: { title: "Dump errand", domainId: "domain_house", effortMinutes: 60, priority: 2 } });
    const afterCapture = await submitInbox("take recycling to the tip today", async () => ({
      model: "fixture",
      summary: "Dump run was added.",
      actions: [
        {
          type: "create_task",
          label: "Add dump run",
          title: "Go to the dump",
          domainName: "House Work",
          projectName: null,
          dueDate: "2026-06-01",
          scheduledDate: "2026-06-01",
          scheduledTime: "17:00",
          effortMinutes: 60,
          energy: "medium",
          strictness: "normal",
          priority: 5,
          importance: 5,
          urgency: 5,
          recurrenceDays: null,
          completionBehavior: "exhaust_once",
          completionMode: "simple_done",
          definitionOfDone: "Take the items to the dump.",
          tags: ["errand"],
          question: null,
          clarificationKind: null,
          clarificationOptions: null,
          schedulingMode: null,
          dateIntent: null
        }
      ]
    }));
    const session = afterCapture.captureSessions[0];
    const oldTask = afterCapture.tasks.find((task) => task.title === "Dump errand");
    const keepTask = afterCapture.tasks.find((task) => task.title === "Go to the dump");

    const afterFollowUp = await addCaptureSessionMessage(session.id, "you didnt get rid of the original task");

    expect(afterFollowUp.tasks.find((task) => task.id === keepTask!.id)?.status).toBe("active");
    expect(afterFollowUp.tasks.find((task) => task.id === oldTask!.id)?.status).toBe("archived");
    expect(afterFollowUp.captureSessions[0].messages.some((message) => /removed duplicate/i.test(message.content))).toBe(true);
  });

  it("uses structured AI revision output for natural follow-up corrections", async () => {
    const afterCapture = await submitInbox("Add a task called Water plants today for 10 minutes.", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const task = afterCapture.tasks.find((candidate) => candidate.title === "Water plants");

    const afterFollowUp = await addCaptureSessionMessage(session.id, "this belongs with Emma and should be a relaxed someday idea", async () => ({
      model: "revision-fixture",
      summary: "Moved the task to Emma and made it a soft idea.",
      shouldApply: true,
      confidence: 0.9,
      title: null,
      projectName: "Emma",
      domainName: null,
      dateIntent: "someday",
      scheduledDate: null,
      scheduledTime: null,
      dueDate: null,
      effortMinutes: null,
      priority: 2,
      importance: 4,
      urgency: 1,
      definitionOfDone: null,
      completionBehavior: "keep_as_suggestion",
      completionMode: "suggestion_used",
      note: "Relaxed someday idea.",
      changes: ["moved under Emma", "moved to someday"]
    }));
    const updated = afterFollowUp.tasks.find((candidate) => candidate.id === task!.id);

    expect(updated?.projectId).toBe("container_emma");
    expect(updated?.dateIntent?.kind).toBe("someday");
    expect(updated?.completionBehavior).toBe("keep_as_suggestion");
    expect(updated?.completionMode).toBe("suggestion_used");
    expect(updated?.notes).toContain("Relaxed someday idea.");
    expect(afterFollowUp.captureSessions[0].revisionEvents[0]).toMatchObject({
      model: "revision-fixture",
      confidence: 0.9,
      changes: ["moved under Emma", "moved to someday", "updated priority", "updated completion behavior", "added note"]
    });
  });

  it("ignores model-generated revision titles unless the user explicitly renames the task", async () => {
    const afterCapture = await submitInbox("Add a task called Water plants today for 10 minutes.", fixtureInterpreter);
    const session = afterCapture.captureSessions[0];
    const task = afterCapture.tasks.find((candidate) => candidate.title === "Water plants");

    const afterFollowUp = await addCaptureSessionMessage(session.id, "actually tomorrow is better", async () => ({
      model: "revision-fixture",
      summary: "Scheduled it for tomorrow.",
      shouldApply: true,
      confidence: 0.9,
      title: "/**/",
      projectName: null,
      domainName: null,
      dateIntent: "tomorrow",
      scheduledDate: "2026-06-02",
      scheduledTime: null,
      dueDate: null,
      effortMinutes: null,
      priority: null,
      importance: null,
      urgency: null,
      definitionOfDone: null,
      completionBehavior: null,
      completionMode: null,
      note: null,
      changes: ["scheduled for tomorrow"]
    }));
    const updated = afterFollowUp.tasks.find((candidate) => candidate.id === task!.id);

    expect(updated?.title).toBe("Water plants");
    expect(updated?.dateIntent?.kind).toBe("tomorrow");
    expect(afterFollowUp.tasks.some((candidate) => candidate.title === "/**/")).toBe(false);
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
