import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";

test.beforeEach(async ({ request }) => resetTestData(request));

test("labels past, current and future periods with inclusive boundaries", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  const periods = [
    {
      periodId: "past",
      startDate: addDays(today, -2),
      endDate: addDays(today, -1),
      state: "終了済み",
    },
    { periodId: "current", startDate: today, endDate: today, state: "利用中" },
    {
      periodId: "future",
      startDate: addDays(today, 1),
      endDate: addDays(today, 2),
      state: "開始前",
    },
  ];
  for (const period of periods)
    await seedPeriod(request, getBaseUrl(), { ...period, budgetYen: 5000 });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${getBaseUrl()}/?periodId=current`);
  await waitForDashboardReady(page);
  await expect(
    page.getByRole("heading", { name: "選択中の予算期間" }),
  ).toBeVisible();
  for (const period of periods) {
    await page.getByTestId("period-select").selectOption(period.periodId);
    await expect(page.getByTestId("period-state")).toHaveText(period.state);
    await expect(page.getByTestId("period-state")).toBeVisible();
  }
});
