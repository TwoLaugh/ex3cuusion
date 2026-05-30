import { expect, test } from "@playwright/test";

test("realistic full-week execution loop with time changes", async ({ page, request }) => {
  await request.post("/api/state");
  await request.post("/api/time", { data: { date: "2026-06-01", time: "08:30" } });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /monday/i })).toBeVisible();
  await expect(page.getByTestId("plan-item-Back rehab")).toBeVisible();
  await expect(page.getByTestId("plan-item-Diet App")).toBeVisible();

  await page.getByLabel("Open menu").click();
  await expect(page.getByRole("button", { name: "Projects" })).toBeVisible();
  await page.getByLabel("Close menu").click();

  await page.getByLabel("Open AI inbox").click();
  await page.getByLabel("Inbox input").fill("Need back rehab daily, clean garage this weekend, finish diet app auth bug before Friday, and message Will.");
  await page.getByRole("button", { name: /send to ai/i }).click();
  await expect(page.getByText(/applied/i).first()).toBeVisible({ timeout: 45000 });
  await page.getByLabel("Close AI inbox").click();

  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();
  await expect(page.getByTestId("plan-item-Back rehab")).toHaveClass(/completed/);
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Undo complete Back rehab" }).click();
  await expect(page.getByTestId("plan-item-Back rehab")).not.toHaveClass(/completed/);
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();
  await page.getByTestId("plan-item-Diet App").getByRole("button", { name: "Not done" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("plan-item-Diet App")).toHaveClass(/deferred/);

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /tuesday/i })).toBeVisible();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByRole("heading", { name: /monday/i })).toBeVisible();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /tuesday/i })).toBeVisible();
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();
  await page.getByTestId("plan-item-Diet App").getByRole("button", { name: "Not done" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("plan-item-Diet App")).toHaveClass(/deferred/);

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /wednesday/i })).toBeVisible();
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();
  await page.getByTestId("plan-item-Diet App").getByRole("button", { name: "Not done" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("plan-item-Diet App")).toHaveClass(/deferred/);

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /thursday/i })).toBeVisible();
  await expect(page.getByTestId("load-level")).toContainText(/240m|210m/);
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();
  await page.getByTestId("plan-item-Diet App").getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("dialog", { name: /diet app project drawer/i })).toBeVisible();
  await expect(page.getByText("Finish auth bug", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /friday/i })).toBeVisible();
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /saturday/i })).toBeVisible();
  await page.getByTestId("plan-item-Back rehab").getByRole("button", { name: "Complete Back rehab" }).click();

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: /sunday/i })).toBeVisible();
  await expect(page.getByTestId("plan-item-Clean garage")).toBeVisible();
});
