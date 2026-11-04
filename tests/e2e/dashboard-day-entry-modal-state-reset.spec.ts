import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("clears history edit state when the modal is closed", async ({
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
  await modal.getByLabel("入力額 (円)").fill("1200");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "modal state reset setup",
  });
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1200 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await modal.getByRole("button", { name: "編集" }).click();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toBeVisible();
  await modal.getByRole("button", { name: "閉じる" }).click();

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByRole("button", { name: "編集" })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "削除" })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toHaveCount(
    0,
  );
});

test("restores unsent amounts and memos after close and Escape", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("入力額 (円)").fill("1234");
  await modal.getByLabel("メモ").fill("買い物の途中");
  await modal.getByRole("button", { name: "閉じる" }).click();
  await expect(modal).toBeHidden();
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("1234");
  await expect(modal.getByLabel("メモ")).toHaveValue("買い物の途中");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("1234");
  await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("");
  await expect(modal.getByLabel("メモ")).toHaveValue("");
});
