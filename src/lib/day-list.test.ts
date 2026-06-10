import { beforeEach, describe, expect, it } from "vitest";
import {
  addTaskToDayList,
  advanceDay,
  applyStructureMutation,
  completeTaskDirect,
  dayListView,
  enrichCapturedTask,
  getState,
  instantCaptureToDayList,
  listChangeHistory,
  removeTaskFromDayList,
  reorderDayList,
  resetState,
  setClock,
  setDayListPin,
  undoChange
} from "./state";

// T092: list-first Today — morning build, carryover, list mutations, tray, gauges, habit streaks,
// and instant capture. Seed baseline on 2026-06-01 (a Monday): the only auto-added entry is the
// daily "Back rehab" recurring task; "Read together" is a keep_as_suggestion (never auto-added)
// and is not due on Mondays anyway.
describe("day list (T092)", () => {
  beforeEach(() => {
    resetState();
    setClock("2026-06-01", "08:30");
  });

  function createTask(patch: Record<string, unknown>): string {
    applyStructureMutation({ entity: "task", action: "create", patch });
    const tasks = getState().tasks;
    return tasks[tasks.length - 1].id;
  }

  it("morning build auto-adds due recurring and dated-today tasks; habits live on the strip, not the list", () => {
    const stretchId = createTask({ title: "Stretch daily", effortMinutes: 10, repeatPolicy: { type: "daily", carryover: "skip" }, completionBehavior: "repeatable" });
    const datedId = createTask({ title: "Dated today", scheduledDate: "2026-06-01", scheduledTime: "14:00", effortMinutes: 20 });
    applyStructureMutation({ entity: "task", action: "update", id: "task_back_rehab", patch: { habit: true } });

    const view = dayListView();
    const stretch = view.entries.find((entry) => entry.taskId === stretchId);
    const dated = view.entries.find((entry) => entry.taskId === datedId);
    expect(stretch?.source).toBe("recurring");
    expect(dated?.source).toBe("manual");
    expect(dated?.pinnedTime).toBe("14:00"); // carried from scheduledTime on a today-scheduled task
    // The habit task is excluded from the list but present on the habit strip.
    expect(view.entries.some((entry) => entry.taskId === "task_back_rehab")).toBe(false);
    expect(view.habits.some((habit) => habit.taskId === "task_back_rehab")).toBe(true);

    // T090 principle holds: a task created AFTER the first view never barges into the list.
    const lateId = createTask({ title: "Latecomer", scheduledDate: "2026-06-01", effortMinutes: 10 });
    expect(dayListView().entries.some((entry) => entry.taskId === lateId)).toBe(false);
  });

  it("carries unfinished manual entries to the next day's list and drops completed ones", () => {
    const carryId = createTask({ title: "Carry me", effortMinutes: 15 });
    const doneId = createTask({ title: "Done me", effortMinutes: 15 });
    dayListView(); // materialize 2026-06-01
    addTaskToDayList(carryId);
    addTaskToDayList(doneId);
    completeTaskDirect(doneId);

    advanceDay(); // 2026-06-02
    const view = dayListView();
    const carried = view.entries.find((entry) => entry.taskId === carryId);
    expect(carried?.source).toBe("carried");
    expect(view.entries.some((entry) => entry.taskId === doneId)).toBe(false);
    // Recurring entries are rebuilt fresh (source "recurring"), not carried.
    expect(view.entries.find((entry) => entry.taskId === "task_back_rehab")?.source).toBe("recurring");
  });

  it("add, remove, reorder, and pin are undoable and idempotent", () => {
    const id = createTask({ title: "Tray me", effortMinutes: 10 });
    dayListView(); // silent morning build — creates no history
    const baseline = listChangeHistory().length;

    addTaskToDayList(id);
    expect(dayListView().entries.find((entry) => entry.taskId === id)?.source).toBe("tray");
    expect(listChangeHistory().length).toBe(baseline + 1);
    addTaskToDayList(id); // idempotent: no duplicate entry, no history noise
    expect(dayListView().entries.filter((entry) => entry.taskId === id)).toHaveLength(1);
    expect(listChangeHistory().length).toBe(baseline + 1);

    setDayListPin(id, "09:15");
    expect(dayListView().entries.find((entry) => entry.taskId === id)?.pinnedTime).toBe("09:15");
    expect(listChangeHistory().length).toBe(baseline + 2);
    setDayListPin(id, "9:15"); // invalid HH:MM rejected silently
    expect(dayListView().entries.find((entry) => entry.taskId === id)?.pinnedTime).toBe("09:15");
    expect(listChangeHistory().length).toBe(baseline + 2);

    reorderDayList([id, "task_back_rehab"]);
    expect(dayListView().entries[0]?.taskId).toBe(id);
    expect(listChangeHistory().length).toBe(baseline + 3);
    reorderDayList(["unknown_task", id, "task_back_rehab"]); // unknown ignored -> same order -> no-op
    expect(dayListView().entries[0]?.taskId).toBe(id);
    expect(listChangeHistory().length).toBe(baseline + 3);

    removeTaskFromDayList(id);
    expect(dayListView().entries.some((entry) => entry.taskId === id)).toBe(false);
    expect(getState().tasks.find((task) => task.id === id)?.status).toBe("active"); // task untouched
    expect(listChangeHistory().length).toBe(baseline + 4);
    removeTaskFromDayList(id); // idempotent
    expect(listChangeHistory().length).toBe(baseline + 4);

    undoChange(); // undo the remove: entry returns with its pin and position intact
    const restored = dayListView();
    expect(restored.entries[0]?.taskId).toBe(id);
    expect(restored.entries[0]?.pinnedTime).toBe("09:15");
  });

  it("tray: due excludes list members; balance surfaces a missing pillar's suggestion", () => {
    const dueId = createTask({ title: "Due thing", dueDate: "2026-06-01", effortMinutes: 15 });
    const ideaId = createTask({ title: "Call gran ideas", folderId: "domain_social", completionBehavior: "keep_as_suggestion", effortMinutes: 15 });

    let view = dayListView();
    expect(view.entries.some((entry) => entry.taskId === dueId)).toBe(true); // due today -> auto-added
    expect(view.tray.due.some((task) => task.taskId === dueId)).toBe(false); // on the list -> not in the tray

    removeTaskFromDayList(dueId);
    view = dayListView();
    expect(view.tray.due.some((task) => task.taskId === dueId)).toBe(true); // removed -> back in the due tray

    // No social task on the list -> the Social Maintenance pillar is missing and its suggestion is offered.
    expect(view.gauges.missingPillars).toContain("Social Maintenance");
    const balanceIdea = view.tray.balance.find((task) => task.taskId === ideaId);
    expect(balanceIdea).toBeDefined();
    expect(balanceIdea?.pillarName).toBe("Social Maintenance");

    // Backlog ranks plannable non-due work and never includes list members or suggestions.
    expect(view.tray.backlog.length).toBeLessThanOrEqual(5);
    expect(view.tray.backlog.some((task) => task.taskId === "task_auth_bug")).toBe(true);
    expect(view.tray.backlog.some((task) => task.taskId === ideaId)).toBe(false);
    expect(view.tray.backlog.some((task) => view.entries.some((entry) => entry.taskId === task.taskId))).toBe(false);
  });

  it("gauges: listMinutes counts only unticked entries and capacity is present", () => {
    const bigId = createTask({ title: "Big task", scheduledDate: "2026-06-01", effortMinutes: 60 });

    let view = dayListView(); // Back rehab (20m) + Big task (60m)
    expect(view.gauges.listMinutes).toBe(80);
    expect(view.gauges.capacityMinutes).toBeGreaterThan(0);

    completeTaskDirect(bigId);
    view = dayListView();
    expect(view.gauges.listMinutes).toBe(20); // completed entry no longer counts
    expect(view.entries.find((entry) => entry.taskId === bigId)?.completedToday).toBe(true);

    // Pillar balance covers list + habits, completed included, with shares summing to 1.
    const total = view.gauges.balance.reduce((sum, pillar) => sum + pillar.share, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(view.gauges.balance.some((pillar) => pillar.name === "Health Repair")).toBe(true);
  });

  it("habit streak counts consecutive completed days and resets after a gap", () => {
    const flossId = createTask({
      title: "Floss",
      effortMinutes: 5,
      habit: true,
      repeatPolicy: { type: "daily", carryover: "skip" },
      completionBehavior: "repeatable"
    });

    completeTaskDirect(flossId); // 06-01
    advanceDay();
    completeTaskDirect(flossId); // 06-02
    advanceDay();
    completeTaskDirect(flossId); // 06-03

    let habit = dayListView().habits.find((entry) => entry.taskId === flossId);
    expect(habit?.completedToday).toBe(true);
    expect(habit?.streak).toBe(3);

    advanceDay(); // 06-04 skipped
    advanceDay(); // 06-05
    completeTaskDirect(flossId);
    habit = dayListView().habits.find((entry) => entry.taskId === flossId);
    expect(habit?.streak).toBe(1); // the gap reset the streak

    // Un-ticking today removes the completion again (toggle), keeping the task repeatable.
    completeTaskDirect(flossId);
    habit = dayListView().habits.find((entry) => entry.taskId === flossId);
    expect(habit?.completedToday).toBe(false);
    expect(getState().tasks.find((task) => task.id === flossId)?.status).toBe("active");
  });

  it("instant capture creates the task and the list entry as one undoable change", () => {
    dayListView(); // morning build happens silently before the capture
    const baseline = listChangeHistory().length;

    const { taskId } = instantCaptureToDayList("Buy milk");
    expect(taskId).toBeDefined();
    const task = getState().tasks.find((candidate) => candidate.id === taskId);
    expect(task).toMatchObject({ title: "Buy milk", effortMinutes: 30, priority: 5, source: "manual" });
    expect(task?.folderId).toBeUndefined();
    expect(dayListView().entries.find((entry) => entry.taskId === taskId)?.source).toBe("manual");
    expect(listChangeHistory().length).toBe(baseline + 1);

    undoChange();
    expect(getState().tasks.some((candidate) => candidate.id === taskId)).toBe(false);
    expect(dayListView().entries.some((entry) => entry.taskId === taskId)).toBe(false);
  });

  it("enrichment fills effort and dates from the captured title without blocking the capture", async () => {
    dayListView();
    const { taskId } = instantCaptureToDayList("Email plumber tomorrow 15 mins");
    expect(getState().tasks.find((candidate) => candidate.id === taskId)?.effortMinutes).toBe(30); // capture itself stays minimal

    await enrichCapturedTask(taskId!); // fixture interpreter in tests: deterministic
    const enriched = getState().tasks.find((candidate) => candidate.id === taskId);
    expect(enriched?.scheduledDate).toBe("2026-06-02");
    expect(enriched?.effortMinutes).toBe(15);
    expect(enriched?.title).toBe("Email plumber tomorrow 15 mins"); // never renamed by enrichment
  });
});
