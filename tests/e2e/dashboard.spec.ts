import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
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
  await expect(page.getByTestId("budget-value")).toContainText("120,000");
  await expect(page.getByTestId("today-food-allowance")).toContainText("4,000 円");
  await expect(page.getByTestId("today-food-used")).toContainText("0 円");
  await expect(page.getByTestId("today-food-remaining")).toContainText("4,000 円");
  await expect(page.getByTestId("base-daily-food")).toContainText("4,000 円");
  await expect(page.getByTestId("food-pace-status")).toContainText("基準どおり");
  await expect(page.getByText(`期間: ${today} - ${endDate}`)).toBeVisible();

  await page.getByLabel("期間予算 (円)").fill("150000");
  await page.getByRole("button", { name: "期間を更新" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("150,000");
});

test("updates period start and end dates from settings inputs", async ({ page, request }) => {
  const startDate = getCurrentJstDate();
  const updatedStartDate = addDays(startDate, 1);
  const updatedEndDate = addDays(startDate, 30);
  const periodId = `p-${startDate}`;

  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000
  });

  await page.goto(`${getBaseUrl()}/`);
  await expect(page.getByTestId("period-id")).toContainText(periodId);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByTestId("current-period-range-start").fill(updatedStartDate);
  await page.getByTestId("current-period-range-end").fill(updatedEndDate);
  await page.getByTestId("current-period-range-apply").click();

  await expect(page.getByText(`期間: ${updatedStartDate} - ${updatedEndDate}`)).toBeVisible();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(updatedStartDate);
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(updatedEndDate);
});
