import { expect, test } from "@playwright/test";

type DebugPlanItem = {
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  type: string;
  taskId?: string;
  selectedTaskIds?: string[];
};

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function endsAfter(item: DebugPlanItem, boundary: string) {
  if (!/^\d{2}:\d{2}$/.test(item.startTime) || !/^\d{2}:\d{2}$/.test(item.endTime)) return false;
  const start = minutes(item.startTime);
  const end = minutes(item.endTime);
  const normalizedEnd = end <= start ? end + 24 * 60 : end;
  return start < minutes(boundary) && normalizedEnd > minutes(boundary);
}

test("realistic character day respects anchors, projects, social goals, and AI capture", async ({ page, request }) => {
  await request.post("/api/scenario/realistic-character");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /wednesday, 3 june 2026/i })).toBeVisible();
  await expect(page.getByTestId("load-level")).toContainText("06:45");

  await expect(page.getByTestId("plan-item-Medication and water")).toBeVisible();
  await expect(page.getByTestId("plan-item-Team standup")).toBeVisible();
  await expect(page.getByTestId("plan-item-Stakeholder critique")).toBeVisible();
  await expect(page.getByTestId("plan-item-Dentist appointment")).toBeVisible();
  await expect(page.getByTestId("plan-item-Dinner with Leo")).toBeVisible();
  await expect(page.getByTestId("plan-item-Sleep")).toBeVisible();
  await expect(page.getByTestId("plan-item-Clinician Dashboard UX Review")).toBeVisible();

  await page.getByTestId("plan-item-Clinician Dashboard UX Review").getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("dialog", { name: /clinician dashboard ux review project drawer/i })).toBeVisible();
  await expect(page.getByText("Polish 6 dashboard screens", { exact: true })).toBeVisible();
  await expect(page.getByText("Review analytics notes", { exact: true })).toBeVisible();
  await expect(page.getByText("Write UX rationale bullets", { exact: true })).toBeVisible();
  await page.getByLabel("Close project drawer").click();

  let debug = await (await request.get("/api/debug")).json();
  const planItems = debug.planItems as DebugPlanItem[];
  const timedItems = planItems.filter((item) => item.status !== "unscheduled" && item.title !== "Sleep");
  expect(timedItems.filter((item) => endsAfter(item, "14:00")).map((item) => item.title)).not.toContain(
    "Clinician Dashboard UX Review"
  );
  expect(timedItems.filter((item) => endsAfter(item, "16:30")).map((item) => item.title)).toEqual([]);
  expect(timedItems.filter((item) => endsAfter(item, "19:30")).map((item) => item.title)).toEqual([]);
  expect(timedItems.filter((item) => endsAfter(item, "23:00")).map((item) => item.title)).toEqual([]);

  const confirmDinner = planItems.find((item) => item.title === "Confirm dinner with Leo");
  expect(confirmDinner?.status).not.toBe("unscheduled");
  expect(minutes(confirmDinner?.startTime ?? "23:59")).toBeLessThan(minutes("19:30"));

  await page
    .getByTestId("plan-item-Clinician Dashboard UX Review")
    .getByRole("button", { name: "Complete Clinician Dashboard UX Review" })
    .click();
  await expect(page.getByTestId("plan-item-Clinician Dashboard UX Review")).toHaveClass(/completed/);
  await page
    .getByTestId("plan-item-Clinician Dashboard UX Review")
    .getByRole("button", { name: "Undo complete Clinician Dashboard UX Review" })
    .click();
  await expect(page.getByTestId("plan-item-Clinician Dashboard UX Review")).not.toHaveClass(/completed/);
  await page
    .getByTestId("plan-item-Clinician Dashboard UX Review")
    .getByRole("button", { name: "Complete Clinician Dashboard UX Review" })
    .click();

  await page.getByTestId("plan-item-Illustrated Recipe Zine").getByRole("button", { name: "Defer" }).click();
  await expect(page.getByTestId("plan-item-Illustrated Recipe Zine")).toHaveClass(/deferred/);

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Add prep two extra critique slides today before 1pm for 25 minutes.");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText(/applied/i).first()).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("Close AI inbox").click();

  debug = await (await request.get("/api/debug")).json();
  const createdTask = debug.tasks.find((task: { title: string; scheduledTime?: string }) =>
    /critique slides/i.test(task.title)
  );
  expect(createdTask).toBeTruthy();
  expect(
    debug.inbox[0].actions.some(
      (action: { type: string; status: string; appliedEntityId?: string }) =>
        action.type === "create_task" && action.status === "applied" && action.appliedEntityId === createdTask.id
    )
  ).toBe(true);
});
