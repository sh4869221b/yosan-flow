import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  configureDashboardDayEntryE2E,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, waitForDashboardReady } from "./dashboard-shared";

configureDashboardDayEntryE2E();

for (const width of [320, 1280]) {
  test(`opens today from its remaining amount and returns focus at ${width}px`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    await waitForDashboardReady(page);
    const action = page.getByRole("button", {
      name: "今日の支出を追加",
      exact: true,
    });
    await expect(action).toBeVisible();
    const first = page.getByTestId("food-pace-panel").locator("p").first();
    await expect(first).toContainText("今日あと使える金額");
    await expect(first.getByTestId("today-food-remaining")).toBeVisible();
    await expect(first.getByRole("button")).toBeVisible();
    await action.click();
    const modal = page.getByTestId("day-entry-modal");
    await expect(modal).toContainText(`対象日: ${todayDate}`);
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(action).toBeFocused();
    await action.press("Enter");
    await modal.getByLabel("追加する支出額 (円)").fill("500");
    await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
    await expect(action).toBeFocused();
    await expect(page.getByTestId("today-food-used")).toHaveText("500 円");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("does not offer today's entry for past or future periods", async ({
  page,
  request,
}) => {
  const { todayDate } = await seedCurrentPeriod(request);
  for (const offset of [-2, 31]) {
    const periodId = `outside-${offset}`;
    await seedPeriod(request, getBaseUrl(), {
      periodId,
      startDate: addDays(todayDate, offset),
      endDate: addDays(todayDate, offset + 1),
      budgetYen: 1000,
    });
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    await waitForDashboardReady(page);
    await expect(
      page.getByRole("button", { name: "今日の支出を追加", exact: true }),
    ).toHaveCount(0);
  }
});
