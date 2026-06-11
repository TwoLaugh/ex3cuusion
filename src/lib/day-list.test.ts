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
  resolveStaleTask,
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

// T093: the intelligent tray — telemetry, TMT ranking, acceptance damping with a hard resurfacing
// floor, gap fit, spaced someday resurfacing, the aging question, and calibrated capacity.
describe("intelligent tray (T093)", () => {
  beforeEach(() => {
    resetState();
    setClock("2026-06-01", "08:30");
  });

  function createTask(patch: Record<string, unknown>): string {
    applyStructureMutation({ entity: "task", action: "create", patch });
    const tasks = getState().tasks;
    return tasks[tasks.length - 1].id;
  }

  // Empty the seed backlog so a test fully controls the candidate pool. Back rehab (recurring,
  // auto-listed) and Read together (suggestion -> balance tray only) stay.
  function archiveSeedBacklog(): void {
    for (const id of ["task_auth_bug", "task_optimizer_tests", "task_message_will", "task_clean_garage"]) {
      applyStructureMutation({ entity: "task", action: "archive", id });
    }
  }

  it("floor: a task unsurfaced for 7 days gets a guaranteed backlog slot over higher-ranked work", () => {
    const weakId = createTask({ title: "Weak but alive", priority: 1, importance: 1, urgency: 1, effortMinutes: 45 });
    // 2026-06-01: pool = 4 seed backlog tasks + this one = exactly 5 -> everything surfaces once.
    expect(dayListView().tray.backlog.some((row) => row.taskId === weakId)).toBe(true);

    // Five strong competitors arrive; on rank alone the weak task would now stay buried forever.
    for (let i = 0; i < 5; i += 1) {
      createTask({ title: `Strong ${i}`, priority: 9, importance: 9, urgency: 9, effortMinutes: 20, definitionOfDone: "Done." });
    }
    const presence: Record<string, boolean> = {};
    for (let day = 0; day < 7; day += 1) {
      advanceDay(); // 06-02 .. 06-08, one tray read per day
      const view = dayListView();
      presence[view.date] = view.tray.backlog.some((row) => row.taskId === weakId);
    }
    expect(presence["2026-06-02"]).toBe(false); // outranked all week...
    expect(presence["2026-06-04"]).toBe(false);
    expect(presence["2026-06-07"]).toBe(false); // ...even at 6 days unsurfaced
    expect(presence["2026-06-08"]).toBe(true); // the 7-day floor overrides rank and damping
  });

  it("acceptance damping: repeated ignoring lowers a task's tray rank but never removes it", () => {
    archiveSeedBacklog();
    const keenId = createTask({ title: "Keen", priority: 3, importance: 3, urgency: 3, effortMinutes: 20 });
    const ignoredId = createTask({ title: "Ignored", priority: 6, importance: 6, urgency: 6, effortMinutes: 20 });

    let backlog = dayListView().tray.backlog;
    expect(backlog[0]?.taskId).toBe(ignoredId); // higher base rank leads on day one

    // The user keeps pulling Keen onto the list (add resets the streak; eject is information,
    // not ignoring) and never touches Ignored, whose ignore streak grows daily.
    for (let day = 0; day < 5; day += 1) {
      addTaskToDayList(keenId);
      removeTaskFromDayList(keenId);
      advanceDay();
      backlog = dayListView().tray.backlog;
    }
    expect(backlog[0]?.taskId).toBe(keenId); // streak-5 damping (x0.4) flipped the order
    expect(backlog.some((row) => row.taskId === ignoredId)).toBe(true); // dampened, never suppressed
  });

  it("suggestSplit flags big-vague backlog tasks, not small or well-defined ones", () => {
    archiveSeedBacklog();
    const vagueId = createTask({ title: "Sort out the whole garden", effortMinutes: 120 });
    const definedId = createTask({ title: "Big but defined", effortMinutes: 120, definitionOfDone: "Beds weeded and edged." });
    const smallId = createTask({ title: "Water the plants", effortMinutes: 10 });

    const backlog = dayListView().tray.backlog;
    expect(backlog.find((row) => row.taskId === vagueId)?.suggestSplit).toBe(true);
    expect(backlog.find((row) => row.taskId === definedId)?.suggestSplit).toBe(false);
    expect(backlog.find((row) => row.taskId === smallId)?.suggestSplit).toBe(false);
  });

  it("avoidance: a run of tiny completions while big work idles lifts small clear tasks over big vague ones", () => {
    archiveSeedBacklog();
    const bigVagueId = createTask({ title: "Rebuild the shed", priority: 9, importance: 9, urgency: 9, strictness: "strict", effortMinutes: 120 });
    const smallClearId = createTask({ title: "File one receipt", priority: 4, importance: 4, urgency: 4, effortMinutes: 15 });

    let backlog = dayListView().tray.backlog;
    expect(backlog.findIndex((row) => row.taskId === bigVagueId)).toBeLessThan(backlog.findIndex((row) => row.taskId === smallClearId));

    // Three <= 15m completions in the 3-day window while the 120m task sits untouched.
    for (let i = 0; i < 3; i += 1) {
      completeTaskDirect(createTask({ title: `Tiny ${i}`, effortMinutes: 10 }));
    }
    backlog = dayListView().tray.backlog;
    expect(backlog.findIndex((row) => row.taskId === smallClearId)).toBeLessThan(backlog.findIndex((row) => row.taskId === bigVagueId));
  });

  it("gap-aware: gapMinutes runs to the next pinned anchor and rows report fitsGap", () => {
    archiveSeedBacklog();
    const fitsId = createTask({ title: "Quick fix", effortMinutes: 45 });
    const tooBigId = createTask({ title: "Long session", effortMinutes: 90 });

    let view = dayListView();
    expect(view.tray.gapMinutes).toBe(840); // no pins: 08:30 -> end of evening 22:30

    setDayListPin("task_back_rehab", "09:30"); // anchor in 60 minutes
    view = dayListView();
    expect(view.tray.gapMinutes).toBe(60);
    expect(view.tray.backlog.find((row) => row.taskId === fitsId)?.fitsGap).toBe(true);
    expect(view.tray.backlog.find((row) => row.taskId === tooBigId)?.fitsGap).toBe(false);
  });

  it("someday: excluded from the backlog except on the spaced 7/14/30/90 schedule", () => {
    archiveSeedBacklog();
    const somedayId = createTask({ title: "Learn the accordion", effortMinutes: 60 });
    dayListView(); // surfaces it once
    resolveStaleTask(somedayId, "someday"); // demoted: quiet, schedule anchored today
    expect(getState().tasks.find((task) => task.id === somedayId)?.dateIntent?.kind).toBe("someday");
    expect(dayListView().tray.backlog.some((row) => row.taskId === somedayId)).toBe(false);

    setClock("2026-06-04", "08:30"); // mid-window: still quiet
    expect(dayListView().tray.backlog.some((row) => row.taskId === somedayId)).toBe(false);

    setClock("2026-06-08", "08:30"); // 7 days after the demotion: resurfaces, tagged
    expect(dayListView().tray.backlog.find((row) => row.taskId === somedayId)?.resurfaced).toBe(true);

    setClock("2026-06-09", "08:30"); // the next interval is 14 days: quiet again
    expect(dayListView().tray.backlog.some((row) => row.taskId === somedayId)).toBe(false);
  });

  it("aging: 5 ignored surfacings raise staleQuestion; resolveStaleTask('keep') clears it and is undoable", () => {
    archiveSeedBacklog();
    const lingerId = createTask({ title: "Linger", effortMinutes: 30 });
    for (let day = 0; day < 4; day += 1) {
      dayListView(); // surfaced and ignored on 06-01 .. 06-04
      advanceDay();
    }
    let row = dayListView().tray.backlog.find((entry) => entry.taskId === lingerId); // 5th surfacing
    expect(row?.staleQuestion).toBe(true); // a QUESTION, never an automatic archive

    const baseline = listChangeHistory().length;
    resolveStaleTask(lingerId, "keep");
    expect(listChangeHistory().length).toBe(baseline + 1);
    row = dayListView().tray.backlog.find((entry) => entry.taskId === lingerId);
    expect(row?.staleQuestion).toBe(false); // streak cleared, task stays in the rotation

    undoChange();
    row = dayListView().tray.backlog.find((entry) => entry.taskId === lingerId);
    expect(row?.staleQuestion).toBe(true); // the resolution rewinds like any list mutation
  });

  it("calibration: gauges use the folder's actual/estimate ratio once it has 3 samples", () => {
    const sampleIds = [0, 1, 2].map((i) => createTask({ title: `House job ${i}`, folderId: "domain_house", effortMinutes: 30 }));
    const plannedId = createTask({ title: "Fix the gate", folderId: "domain_house", effortMinutes: 30 });
    const trayHouseId = createTask({ title: "Oil the hinges", folderId: "domain_house", effortMinutes: 40 });
    dayListView(); // materialize the morning list first
    for (const id of sampleIds) completeTaskDirect(id, 60); // every 30m estimate ran 60m: ratio 2.0

    addTaskToDayList(plannedId);
    const view = dayListView();
    expect(view.gauges.listMinutes).toBe(50); // Back rehab 20 + gate 30, raw estimates
    // House ratio 2.0 reprices the gate; Back rehab's folder has no samples -> global fallback 2.0.
    expect(view.gauges.calibratedListMinutes).toBe(100);
    expect(view.tray.backlog.find((row) => row.taskId === trayHouseId)?.calibrationRatio).toBe(2);
  });

  it("tray signals are idempotent on a same-date double read and the tray stays stable", () => {
    const first = dayListView();
    const signalsAfterFirst = getState().traySignals;
    const second = dayListView();
    expect(getState().traySignals).toEqual(signalsAfterFirst); // no growth on a re-read
    expect(second.tray.backlog.map((row) => row.taskId)).toEqual(first.tray.backlog.map((row) => row.taskId));
    const surfaced = signalsAfterFirst.find((signal) => signal.taskId === first.tray.backlog[0]?.taskId);
    expect(surfaced).toMatchObject({
      surfacedCount: 1,
      ignoredStreak: 1,
      firstSurfacedDate: "2026-06-01",
      lastSurfacedDate: "2026-06-01",
      lastOutcome: "ignored"
    });
  });
});
