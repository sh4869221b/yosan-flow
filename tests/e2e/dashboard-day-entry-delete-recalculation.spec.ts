import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl, waitForDashboardReady } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("deletes history rows and keeps recalculated values after reload", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  for (const [index, inputYen] of ["1000", "2000"].entries()) {
    if (index > 0) {
      await page.getByTestId(`calendar-day-${todayDate}`).click();
      await expect(modal).toBeVisible();
    }
    await modal.getByLabel("追加する支出額 (円)").fill(inputYen);
    await saveDayEntrySuccessfully({
      page,
      modal,
      periodId,
      date: todayDate,
      responseAssertionContext: `delete recalculation setup ${inputYen} yen`,
    });
  }
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("3000 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const deleteRow = modal.locator("li").filter({ hasText: "入力 1000 円" });
  await deleteRow.getByRole("button", { name: "削除" }).click();
  await deleteRow.getByRole("button", { name: "削除を確定" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(deleteRow).toHaveCount(0);

  const lastRow = modal.locator("li").filter({ hasText: "入力 2000 円" });
  await lastRow.getByRole("button", { name: "削除" }).click();
  await lastRow.getByRole("button", { name: "削除を確定" }).click();
  await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("0 円");

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("0 円");
});

test("shows a zero-yen memo as recorded until its final history is deleted", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const day = page.getByTestId(`calendar-day-${todayDate}`);
  await expect(day.locator('[data-status="recorded"]')).toHaveCount(0);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("追加する支出額 (円)").fill("0");
  await modal.getByLabel("メモ").fill("メモのみ");
  await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
  await expect(day.locator('[data-status="recorded"]')).toBeVisible();
  await expect(day).toHaveAttribute("aria-label", /0 円、入力済み/);
  await page.reload();
  await waitForDashboardReady(page);
  await expect(day.locator('[data-status="recorded"]')).toBeVisible();
  await day.click();
  const row = modal.locator("li").filter({ hasText: "メモのみ" });
  await row.getByRole("button", { name: "削除" }).click();
  await row.getByRole("button", { name: "削除を確定" }).click();
  await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
  await expect(day.locator('[data-status="recorded"]')).toHaveCount(0);
  await page.reload();
  await expect(day.locator('[data-status="recorded"]')).toHaveCount(0);
  await expect(day).not.toHaveAttribute("aria-label", /入力済み/);
});
