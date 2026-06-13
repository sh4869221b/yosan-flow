import { expect, test, type APIRequestContext } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  fetchPeriodSummary,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

export type SeededDayEntryPeriod = {
  readonly periodId: string;
  readonly todayDate: string;
};

export function configureDashboardDayEntryE2E(): void {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async ({ browser, request }) => {
    await resetTestData(request);
    await warmUpBrowser(browser);
  });
}

export async function seedCurrentPeriod(
  request: APIRequestContext,
): Promise<SeededDayEntryPeriod> {
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();

  return {
    periodId,
    todayDate: todayRow?.date ?? startDate,
  };
}
