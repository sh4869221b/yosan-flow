import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("keeps history edits after stale summary and history responses", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const summaryPath = `/api/periods/${encodeURIComponent(periodId)}`;
  const historyPath = `${summaryPath}/days/${encodeURIComponent(todayDate)}/history`;
  const staleSummaryCaptured = Promise.withResolvers<void>();
  const staleSummaryReleased = Promise.withResolvers<void>();
  const staleHistoryCaptured = Promise.withResolvers<void>();
  const staleHistoryReleased = Promise.withResolvers<void>();

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await page.route(`**${summaryPath}`, async (route) => {
    const response = await route.fetch();
    staleSummaryCaptured.resolve();
    await staleSummaryReleased.promise;
    await route.fulfill({ response });
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("mutation race");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "stale summary setup",
  });
  await staleSummaryCaptured.promise;

  const historyUrl = new URL(historyPath, page.url()).href;
  const reopenedHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && response.url() === historyUrl,
  );
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal).toBeVisible();
  expect((await reopenedHistoryResponse).ok()).toBe(true);
  const historyRow = modal.locator("li").filter({ hasText: "mutation race" });
  await expect(historyRow).toBeVisible();
  await historyRow.getByRole("button", { name: "編集" }).click();
  let editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("1000");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1000 円");

  await page.route(`**${historyPath}`, async (route) => {
    const response = await route.fetch();
    staleHistoryCaptured.resolve();
    await staleHistoryReleased.promise;
    await route.fulfill({ response });
  });
  staleSummaryReleased.resolve();
  await staleHistoryCaptured.promise;

  await historyRow.getByRole("button", { name: "編集" }).click();
  editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("500");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("500 円");

  staleHistoryReleased.resolve();
  await expect(historyRow).toContainText("入力 500 円");
  await expect(historyRow).not.toContainText("入力 1000 円");
});
