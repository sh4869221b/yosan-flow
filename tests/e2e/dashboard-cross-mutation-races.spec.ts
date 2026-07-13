import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("reconciles a delayed history edit after a newer day add", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const summaryPath = `/api/periods/${encodeURIComponent(periodId)}`;

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("入力額 (円)").fill("1000");
  await modal.getByLabel("メモ").fill("delayed edit");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
  });

  const firstHistoryPath = `${summaryPath}/days/${encodeURIComponent(todayDate)}/history`;
  const firstHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(firstHistoryPath),
  );
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  expect((await firstHistoryResponse).ok()).toBe(true);
  const historyRow = modal.locator("li").filter({ hasText: "delayed edit" });
  await historyRow.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("500");

  const mutationCaptured = Promise.withResolvers<void>();
  const mutationReleased = Promise.withResolvers<void>();
  await page.route(`**${firstHistoryPath}/*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    mutationCaptured.resolve();
    await mutationReleased.promise;
    await route.fulfill({ response });
  });
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await mutationCaptured.promise;

  await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: secondDate,
  });
  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("newer add");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: secondDate,
  });
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("500 円");
  await expect(
    page
      .getByTestId(`calendar-day-${secondDate}`)
      .getByTestId(`used-${secondDate}`),
  ).toHaveText("2000 円");

  const reconciliationResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().endsWith(summaryPath),
  );
  mutationReleased.resolve();
  expect((await reconciliationResponse).ok()).toBe(true);
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("500 円");
  await expect(
    page
      .getByTestId(`calendar-day-${secondDate}`)
      .getByTestId(`used-${secondDate}`),
  ).toHaveText("2000 円");
});
