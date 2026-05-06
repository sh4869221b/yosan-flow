import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
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
  await expect(page.getByTestId("today-food-allowance")).toContainText(
    "4,000 円",
  );
  await expect(page.getByTestId("today-food-used")).toContainText("0 円");
  await expect(page.getByTestId("today-food-remaining")).toContainText(
    "4,000 円",
  );
  await expect(page.getByTestId("base-daily-food")).toContainText("4,000 円");
  await expect(page.getByTestId("food-pace-status")).toContainText(
    "基準どおり",
  );
  await expect(page.getByText(`期間: ${today} - ${endDate}`)).toBeVisible();

  await page.getByLabel("期間予算 (円)").fill("150000");
  await page.getByRole("button", { name: "期間を更新" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("150,000");
});

test("updates period start and end dates from settings inputs", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const updatedStartDate = addDays(startDate, 1);
  const updatedEndDate = addDays(startDate, 30);
  const periodId = `p-${startDate}`;

  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await expect(page.getByTestId("period-id")).toContainText(periodId);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByTestId("current-period-range-start").fill(updatedStartDate);
  await page.getByTestId("current-period-range-end").fill(updatedEndDate);
  await page.getByTestId("current-period-range-apply").click();

  await expect(
    page.getByText(`期間: ${updatedStartDate} - ${updatedEndDate}`),
  ).toBeVisible();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    updatedStartDate,
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    updatedEndDate,
  );
});

test("switches between current and future budget periods", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const currentPeriodId = `p-${startDate}`;
  const futureStartDate = addDays(startDate, 30);
  const futureEndDate = addDays(startDate, 59);
  const futurePeriodId = `p-${futureStartDate}`;

  await seedPeriod(request, getBaseUrl(), {
    periodId: currentPeriodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: futurePeriodId,
    startDate: futureStartDate,
    endDate: futureEndDate,
    budgetYen: 90000,
  });

  await page.goto(`${getBaseUrl()}/`);
  await expect(page.getByTestId("period-id")).toContainText(currentPeriodId);

  await page.getByTestId("period-select").selectOption(futurePeriodId);

  await expect(page.getByTestId("period-id")).toContainText(futurePeriodId);
  await expect(
    page.getByText(`期間: ${futureStartDate} - ${futureEndDate}`),
  ).toBeVisible();
  await expect(page.getByTestId("today-food-allowance")).toContainText("0 円");
});

test("creates the next budget period from secondary settings", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const currentPeriodId = `p-${startDate}`;
  const nextStartDate = addDays(startDate, 30);
  const nextEndDate = addDays(startDate, 59);
  const nextPeriodId = `p-${nextStartDate}`;

  await seedPeriod(request, getBaseUrl(), {
    periodId: currentPeriodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/`);
  await expect(page.getByTestId("period-id")).toContainText(currentPeriodId);
  await page.getByText("次の予算期間を作成する").click();
  await page.getByLabel("期間ID").fill(nextPeriodId);
  await page.getByTestId("create-period-range-start").fill(nextStartDate);
  await page.getByTestId("create-period-range-end").fill(nextEndDate);
  await page.getByTestId("create-period-range-apply").click();
  await page.getByLabel("新規予算額 (円)").fill("90000");
  await page.getByRole("button", { name: "期間を作成" }).click();

  await expect(page.getByTestId("period-id")).toContainText(nextPeriodId);
  await expect(
    page.getByText(`期間: ${nextStartDate} - ${nextEndDate}`),
  ).toBeVisible();
  await expect(page.getByTestId("budget-value")).toContainText("90,000");
});

test("shows an error when shrinking a period would exclude saved entries", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  const originalEndDate = addDays(startDate, 29);
  const invalidEndDate = addDays(startDate, 28);

  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: originalEndDate,
    budgetYen: 120000,
    dailyTotals: [{ date: originalEndDate, totalUsedYen: 500 }],
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByTestId("current-period-range-end").fill(invalidEndDate);
  await page.getByTestId("current-period-range-apply").click();

  await expect(page.getByRole("alert")).toContainText(
    "期間外に出る日次データが存在するため、この変更は適用できません。",
  );
  await expect(
    page.getByText(`期間: ${startDate} - ${originalEndDate}`),
  ).toBeVisible();
});
