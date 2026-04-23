import { expect, test } from "@playwright/test";
import { addDays, getBaseUrl, getCurrentJstDate, startDevServer, stopDevServer, warmUpBrowser } from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser }, testInfo) => {
  testInfo.setTimeout(120_000);
  await stopDevServer();
  await startDevServer();
  await warmUpBrowser(browser);
});

test.afterEach(async () => {
  await stopDevServer();
});

test("shows period creation form on empty dashboard", async ({ page }) => {
  await page.goto(`${getBaseUrl()}/`);

  await expect(page.getByTestId("create-period-panel")).toBeVisible();
  await expect(page.getByLabel("期間ID")).toBeVisible();
  await expect(page.getByLabel("新規予算額 (円)")).toBeVisible();
  await expect(page.getByRole("button", { name: "期間を作成" })).toBeVisible();
});

test("creates period and updates budget", async ({ page }) => {
  const today = getCurrentJstDate();
  const endDate = addDays(today, 29);

  await page.goto(`${getBaseUrl()}/`);
  await page.getByLabel("期間ID").fill(`p-${today}`);
  await page.getByRole("button", { name: "期間を作成" }).click();

  await expect(page.getByTestId("period-id")).toContainText(`p-${today}`);
  await expect(page.getByTestId("budget-value")).toContainText("120000");
  await expect(page.getByText(`期間: ${today} - ${endDate}`)).toBeVisible();

  await page.getByLabel("期間予算 (円)").fill("150000");
  await page.getByRole("button", { name: "期間を更新" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("150000");
});
