import { expect, test } from "@playwright/test";

test("AI-created simple task is logged, applied, and patchable from chat", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Add a task called Water plants today for 10 minutes.");
  await page.getByRole("button", { name: /send to ai/i }).click();

  await expect(page.getByText(/applied/i).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Task: Water plants/i).first()).toBeVisible();
  await page.getByPlaceholder("Correct or add context...").fill("actually make that next week and put it under Diet App");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Updated Water plants/)).toBeVisible({ timeout: 45_000 });

  const debug = await (await request.get("/api/debug")).json();
  const createdTask = debug.tasks.find((task: { title: string }) => /water plants/i.test(task.title));
  expect(createdTask).toBeTruthy();
  expect(createdTask.projectId).toBe("project_diet_app");
  expect(createdTask.dateIntent.kind).toBe("week_window");
  expect(debug.inbox[0].actions.some((action: { type: string; status: string; appliedEntityId?: string }) =>
    action.type === "create_task" && action.status === "applied" && Boolean(action.appliedEntityId)
  )).toBe(true);
  await page.getByLabel("Close AI inbox").click();
  await expect(page.getByTestId(`plan-item-${createdTask.title}`)).toHaveCount(0);
});

test("vague AI capture is logged as needing confirmation instead of silently failing", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Maybe deal with the vague house thing sometime.");
  await page.getByRole("button", { name: /send to ai/i }).click();

  await expect(page.getByText(/What is the next concrete action/i).first()).toBeVisible({ timeout: 45_000 });

  const debug = await (await request.get("/api/debug")).json();
  expect(debug.inbox[0].actions.some((action: { safety: string; skippedReason?: string }) =>
    action.safety === "needs_confirmation" && Boolean(action.skippedReason)
  )).toBe(true);
});

test("AI sleep anchor at half 11 pins the day and prevents flexible work overrunning it", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "22:47" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Add sleep at half 11 tonight for 8 hours.");
  await page.getByRole("button", { name: /send to ai/i }).click();

  await expect(page.getByText(/applied/i).first()).toBeVisible({ timeout: 45_000 });

  const debug = await (await request.get("/api/debug")).json();
  const sleepTask = debug.tasks.find((task: { title: string; scheduledTime?: string }) =>
    /sleep|bed/i.test(task.title) && task.scheduledTime === "23:30"
  );
  expect(sleepTask).toBeTruthy();

  const sleepItem = debug.planItems.find((item: { taskId?: string; startTime: string }) => item.taskId === sleepTask.id);
  expect(sleepItem?.startTime).toBe("23:30");

  const overrunningItems = debug.planItems.filter((item: { title: string; startTime: string; endTime: string; status: string }) => {
    if (item.status === "unscheduled" || /sleep|bed/i.test(item.title)) return false;
    const [startHour, startMinute] = item.startTime.split(":").map(Number);
    const [endHour, endMinute] = item.endTime.split(":").map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return start < 23 * 60 + 30 && (end > 23 * 60 + 30 || end < start);
  });
  expect(overrunningItems).toEqual([]);
});

test("AI inbox handles realistic clarifying capture sessions", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();

  await page.getByLabel("Inbox input").fill("clean the house this weekend");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText("What would count as enough cleaning for this task?")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Kitchen and bathroom" }).click();
  await expect(page.getByText("Task: Clean house")).toBeVisible();

  await page.getByLabel("Inbox input").fill("work on diet app for two hours");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText("A Diet App timebox was added.")).toBeVisible({ timeout: 45_000 });

  await page.getByLabel("Inbox input").fill("ideas for things to do with Emma");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText("Should I keep this as a reusable Emma suggestion list?")).toBeVisible({ timeout: 45_000 });
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/capture-sessions/") && response.url().includes("/answer")),
    page.getByRole("button", { name: "Reusable suggestion" }).click()
  ]);

  const debug = await (await request.get("/api/debug")).json();
  const cleanHouse = debug.tasks.find((task: { title: string; definitionOfDone?: string }) => task.title === "Clean house");
  const dietTimebox = debug.tasks.find((task: { title: string; completionMode?: string }) => task.title === "Work on Diet App");
  const emmaIdea = debug.tasks.find((task: { title: string; completionBehavior?: string; projectId?: string }) =>
    task.title === "Ideas for things to do with Emma"
  );

  expect(cleanHouse?.definitionOfDone).toBe("Kitchen and bathroom");
  expect(dietTimebox?.completionMode).toBe("timebox");
  expect(emmaIdea?.completionBehavior).toBe("keep_as_suggestion");
  expect(emmaIdea?.projectId).toBe("container_emma");
  expect(debug.captureSessions.filter((session: { questions: unknown[] }) => session.questions.length > 0).length).toBeGreaterThanOrEqual(2);

  await page.getByLabel("Close AI inbox").click();
  await expect(page.getByTestId("plan-item-Clean house")).toBeVisible();
});

test("background and concurrent AI work is visible as intentional overlap", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "18:00" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("AI can run the report while I cook dinner tonight");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText(/overlapping tasks/i).first()).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Close AI inbox").click();

  await expect(page.getByTestId("plan-item-Cook dinner")).toBeVisible();
  await expect(page.getByTestId("plan-item-Run AI report draft")).toBeVisible();
  await expect(page.getByTestId("plan-item-Cook dinner").getByText("concurrent", { exact: true })).toBeVisible();
  await expect(page.getByTestId("plan-item-Run AI report draft").getByText("background", { exact: true })).toBeVisible();

  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Planning preferences" }).click();
  await expect(page.getByText(/1 background, 1 concurrent, 0 phased tasks tracked/)).toBeVisible();

  const debug = await (await request.get("/api/debug")).json();
  const dinner = debug.tasks.find((task: { title: string }) => task.title === "Cook dinner");
  const report = debug.tasks.find((task: { title: string }) => task.title === "Run AI report draft");
  expect(dinner?.scheduling).toMatchObject({ mode: "concurrent", attentionLoad: "partial", canOverlap: true });
  expect(report?.scheduling).toMatchObject({ mode: "background", attentionLoad: "passive", canOverlap: true });
});

test("burger task panel exposes next-week backlog without a calendar grid", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-02", time: "08:30" } });
  await request.post("/api/inbox", { data: { input: "book dentist sometime next week" } });
  await page.goto("/");

  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Tasks" }).click();

  const nextWeek = page.getByLabel("Next week backlog");
  await expect(nextWeek.getByRole("heading", { name: "Next week backlog" })).toBeVisible();
  await expect(nextWeek.getByText("Book dentist")).toBeVisible();
  await expect(nextWeek.getByText("08.06.26-14.06.26")).toBeVisible();
  await expect(page.getByTestId("plan-item-Book dentist")).toHaveCount(0);

  await page.getByLabel("Close Tasks").click();
  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Planning preferences" }).click();
  await expect(page.getByText(/1 next week/)).toBeVisible();
});

test("manual structure panels correct tasks, projects, domains, and routines", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-02", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Domains" }).click();
  await page.getByLabel("Create domain").getByLabel("Domain name").fill("Manual Ops");
  await page.getByLabel("Create domain").getByLabel("Domain weight").fill("6");
  await page.getByLabel("Create domain").getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Name Manual Ops")).toBeVisible();

  await page.getByLabel("Close Domains").click();
  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Projects" }).click();
  await page.getByLabel("Create project").getByLabel("Project name").fill("Manual Project");
  await page.getByLabel("Create project").getByLabel("Project domain").selectOption({ label: "Manual Ops" });
  await page.getByLabel("Create project").getByLabel("Default block minutes").fill("50");
  await page.getByLabel("Create project").getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Name Manual Project")).toBeVisible();

  await page.getByLabel("Close Projects").click();
  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Tasks" }).click();
  await page.getByLabel("Create task").getByLabel("Task title").fill("Manual correction task");
  await page.getByLabel("Create task").getByLabel("Task project").selectOption({ label: "Manual Project" });
  await page.getByLabel("Create task").getByLabel("Task minutes").fill("35");
  await page.getByLabel("Create task").getByLabel("Task due date").fill("2026-06-05");
  await page.getByLabel("Create task").getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Manual correction task")).toBeVisible();

  const taskCard = page.locator("article").filter({ hasText: "Manual correction task" });
  await taskCard.getByText("Edit").click();
  await taskCard.getByLabel("Title Manual correction task").fill("Manual correction task revised");
  await taskCard.getByLabel("Minutes Manual correction task").fill("20");
  await taskCard.getByLabel("Due Manual correction task").fill("2026-06-06");
  await taskCard.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Manual correction task revised")).toBeVisible();

  await page.getByLabel("Close Tasks").click();
  await page.getByLabel("Open menu").click();
  await page.getByRole("button", { name: "Routines" }).click();
  await page.getByLabel("Create routine").getByLabel("Routine title").fill("Manual routine");
  await page.getByLabel("Create routine").getByLabel("Routine domain").selectOption({ label: "Manual Ops" });
  await page.getByLabel("Create routine").getByLabel("Routine minutes").fill("12");
  await page.getByLabel("Create routine").getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Title Manual routine")).toBeVisible();

  const debug = await (await request.get("/api/debug")).json();
  const domain = debug.domains.find((entry: { name: string }) => entry.name === "Manual Ops");
  const project = debug.projects.find((entry: { name: string }) => entry.name === "Manual Project");
  const task = debug.tasks.find((entry: { title: string }) => entry.title === "Manual correction task revised");
  const routine = debug.routines.find((entry: { title: string }) => entry.title === "Manual routine");

  expect(domain).toBeTruthy();
  expect(project).toMatchObject({ domainId: domain.id, defaultBlockMinutes: 50 });
  expect(task).toMatchObject({ projectId: project.id, domainId: domain.id, effortMinutes: 20, dueDate: "2026-06-06" });
  expect(routine).toMatchObject({ domainId: domain.id, defaultEffortMinutes: 12, active: true });
});
