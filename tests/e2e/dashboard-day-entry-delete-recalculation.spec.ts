import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("deletes history rows and keeps recalculated values after reload", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = page.getByTestId("day-entry-modal");
  for (const inputYen of ["1000", "2000"]) {
    await page.getByTestId(`calendar-day-${todayDate}`).click();
    await expect(modal).toBeVisible();
    await modal.getByLabel("入力額 (円)").fill(inputYen);
    await modal.getByRole("button", { name: "保存する" }).click();
  }
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("3000 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const deleteRow = modal.locator("li").filter({ hasText: "入力 1000 円" });
  await deleteRow.getByRole("button", { name: "削除" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(deleteRow).toHaveCount(0);

  const lastRow = modal.locator("li").filter({ hasText: "入力 2000 円" });
  await lastRow.getByRole("button", { name: "削除" }).click();
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
