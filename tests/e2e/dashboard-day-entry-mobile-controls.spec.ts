import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("shows history edit and delete controls on mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = page.getByTestId("day-entry-modal");
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await modal.getByLabel("入力額 (円)").fill("1200");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "mobile controls setup",
  });
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1200 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByText("上書き")).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "削除" })).toBeVisible();
  await modal.getByRole("button", { name: "編集" }).click();
  await expect(
    modal.getByRole("button", { name: "保存", exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toBeVisible();
});
