import { expect, test } from "@playwright/test";

test("AI-created simple task is logged, applied, and visible in Today", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Add a task called Water plants today for 10 minutes.");
  await page.getByRole("button", { name: /send to ai/i }).click();

  await expect(page.getByText(/applied/i).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/create_task/i).first()).toBeVisible();

  const debug = await (await request.get("/api/debug")).json();
  const createdTask = debug.tasks.find((task: { title: string }) => /water plants/i.test(task.title));
  expect(createdTask).toBeTruthy();
  expect(debug.inbox[0].actions.some((action: { type: string; status: string; appliedEntityId?: string }) =>
    action.type === "create_task" && action.status === "applied" && Boolean(action.appliedEntityId)
  )).toBe(true);
  expect(debug.planItems.some((item: { title: string; taskId?: string }) =>
    /water plants/i.test(item.title) || item.taskId === createdTask.id
  )).toBe(true);

  await page.getByLabel("Close AI inbox").click();
  await expect(page.getByTestId(`plan-item-${createdTask.title}`)).toBeVisible();
});

test("vague AI capture is logged as needing confirmation instead of silently failing", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Maybe deal with the vague house thing sometime.");
  await page.getByRole("button", { name: /send to ai/i }).click();

  await expect(page.getByText(/needs_confirmation/i).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Needs confirmation before applying/i).first()).toBeVisible();

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
