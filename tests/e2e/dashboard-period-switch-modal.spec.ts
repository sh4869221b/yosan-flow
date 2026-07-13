import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";

configureDashboardDayEntryE2E();

const viewports = [
  { height: 900, name: "desktop", width: 1_440 },
  { height: 844, name: "mobile", width: 390 },
] as const;

for (const viewport of viewports) {
  test(`closes the ${viewport.name} day-entry modal after switching periods`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const nextPeriodId = `${periodId}-next`;
    await seedPeriod(request, getBaseUrl(), {
      periodId: nextPeriodId,
      startDate: addDays(todayDate, 30),
      endDate: addDays(todayDate, 59),
      budgetYen: 120_000,
    });
    await page.goto(
      `${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`,
    );
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: todayDate,
    });
    const evidenceDirectory = process.env.VISUAL_QA_DIR;
    if (evidenceDirectory != null) {
      await page.screenshot({
        fullPage: true,
        path: `${evidenceDirectory}/${viewport.name}-modal-open.png`,
      });
    }

    const summaryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().endsWith(`/api/periods/${nextPeriodId}`),
    );
    await page.getByTestId("period-select").selectOption(nextPeriodId);
    expect((await summaryResponse).ok()).toBe(true);

    await expect(modal).toBeHidden();
    await expect(page.getByTestId("period-id")).toContainText(nextPeriodId);
    if (evidenceDirectory != null) {
      await page.screenshot({
        fullPage: true,
        path: `${evidenceDirectory}/${viewport.name}-period-switched.png`,
      });
    }
  });
}
