import { expect, test } from "@playwright/test";

test("mobile web exposes core V1 actions without layout blockers", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /monday/i })).toBeVisible();
  await expect(page.getByTestId("load-level")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review day" })).toBeVisible();

  await page.getByRole("button", { name: "Review day" }).click();
  await expect(page.getByRole("dialog", { name: "Daily review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save review" })).toBeVisible();
  await page.getByLabel("Close daily review").click();

  await page.getByLabel("Open AI inbox").click();
  await expect(page.getByRole("dialog", { name: "AI inbox" })).toBeVisible();
  await expect(page.getByLabel("Inbox input")).toBeVisible();
  await page.getByLabel("Close AI inbox").click();

  await page.getByLabel("Open menu").click();
  await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(page.getByRole("region", { name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planned today" })).toBeVisible();
});
