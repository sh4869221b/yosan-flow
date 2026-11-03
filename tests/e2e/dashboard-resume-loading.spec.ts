import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import { holdDashboardRead, resumeDashboard } from "./dashboard-resume-helpers";
import { seedPeriod } from "./helpers/db";

configureDashboardDayEntryE2E();

for (const failList of [false, true]) {
  test(`settles foreground loading before a queued resume (list failure: ${failList})`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const otherId = `${periodId}-next`;
    await seedPeriod(request, getBaseUrl(), {
      periodId: otherId,
      startDate: addDays(todayDate, 30),
      endDate: addDays(todayDate, 59),
      budgetYen: 120_000,
    });
    await page.goto(
      `${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`,
    );
    await waitForDashboardReady(page);
    const oldRead = await holdDashboardRead(
      page,
      `${getBaseUrl()}/api/periods/${otherId}`,
    );
    const select = page.getByRole("combobox", { name: "期間を切り替え" });
    try {
      await select.selectOption(otherId);
      await oldRead.arrived;
      await expect(select).toBeDisabled();
      if (failList) {
        await page.route(`${getBaseUrl()}/api/periods`, (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "再取得に失敗しました。" },
            }),
          }),
        );
      }
      await resumeDashboard(page);
      // The page defers resume until the foreground selection settles.
      await expect(select).toBeDisabled();
      const resumed = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url() === `${getBaseUrl()}/api/periods`,
      );
      oldRead.release();
      await oldRead.finished;
      await (await resumed).finished();
      await expect(select).toBeEnabled();
      await expect(select).toHaveValue(otherId);
      await expect(page.getByTestId("period-id")).toContainText(otherId);
      await expect(
        page.getByText("読み込み中...", { exact: true }),
      ).toHaveCount(0);
    } finally {
      oldRead.release();
    }
  });
}
