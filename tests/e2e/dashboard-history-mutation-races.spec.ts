import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { seedPeriod } from "./helpers/db";
import { addDays, getBaseUrl, getCurrentJstDate } from "./dashboard-shared";

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

test("keeps a new period history load after an old period edit settles", async ({
  page,
  request,
}) => {
  const { periodId: currentPeriodId, todayDate } =
    await seedCurrentPeriod(request);
  const futureStartDate = addDays(getCurrentJstDate(), 30);
  const futurePeriodId = `p-${futureStartDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId: futurePeriodId,
    startDate: futureStartDate,
    endDate: addDays(futureStartDate, 29),
    budgetYen: 90_000,
  });

  await page.goto(
    `${getBaseUrl()}/?periodId=${encodeURIComponent(currentPeriodId)}`,
  );
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId: currentPeriodId,
    date: todayDate,
  });
  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("period A edit");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId: currentPeriodId,
    date: todayDate,
  });

  const currentHistoryPath = `/api/periods/${encodeURIComponent(currentPeriodId)}/days/${encodeURIComponent(todayDate)}/history`;
  const currentHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(currentHistoryPath),
  );
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  expect((await currentHistoryResponse).ok()).toBe(true);
  const historyRow = modal.locator("li").filter({ hasText: "period A edit" });
  await expect(historyRow).toBeVisible();
  await historyRow.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("1000");

  const oldMutationCaptured = Promise.withResolvers<void>();
  const oldMutationReleased = Promise.withResolvers<void>();
  const oldMutationPath = `/api/periods/${encodeURIComponent(currentPeriodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  await page.route(`**${oldMutationPath}*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    oldMutationCaptured.resolve();
    await oldMutationReleased.promise;
    await route.fulfill({ response });
  });
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await oldMutationCaptured.promise;

  const futureHistoryCaptured = Promise.withResolvers<void>();
  const futureHistoryReleased = Promise.withResolvers<void>();
  const futureHistoryPath = `/api/periods/${encodeURIComponent(futurePeriodId)}/days/${encodeURIComponent(futureStartDate)}/history`;
  await page.route(`**${futureHistoryPath}`, async (route) => {
    const response = await route.fetch();
    futureHistoryCaptured.resolve();
    await futureHistoryReleased.promise;
    await route.fulfill({ response });
  });
  await page.getByTestId("period-select").selectOption(futurePeriodId);
  await expect(page.getByTestId("period-id")).toContainText(futurePeriodId);
  await page.getByTestId(`calendar-day-${futureStartDate}`).click();
  await futureHistoryCaptured.promise;

  const oldMutationDelivered = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes(oldMutationPath),
  );
  oldMutationReleased.resolve();
  expect((await oldMutationDelivered).ok()).toBe(true);
  await expect(page.getByTestId("period-id")).toContainText(futurePeriodId);

  const futureHistoryDelivered = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(futureHistoryPath),
  );
  futureHistoryReleased.resolve();
  expect((await futureHistoryDelivered).ok()).toBe(true);
  await expect(modal).toContainText(`対象日: ${futureStartDate}`);
  await expect(modal.getByText("履歴を読み込み中...")).toBeHidden();
  await expect(
    modal.getByText("入力を保存すると履歴が表示されます。"),
  ).toBeVisible();
});
