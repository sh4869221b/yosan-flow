import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("serializes a day add after a delayed history edit", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const baseUrl = getBaseUrl();
  const summaryPath = `/api/periods/${encodeURIComponent(periodId)}`;
  const secondAddPath = `${summaryPath}/days/${encodeURIComponent(secondDate)}/add`;
  const secondAddUrl = new URL(secondAddPath, baseUrl).href;
  let secondAddRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === secondAddUrl) {
      secondAddRequestCount += 1;
    }
  });

  await page.goto(`${baseUrl}/?periodId=${encodeURIComponent(periodId)}`);
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
  const firstHistoryUrl = new URL(firstHistoryPath, baseUrl).href;
  const firstHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url() === firstHistoryUrl,
  );
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  expect((await firstHistoryResponse).ok()).toBe(true);
  const historyRow = modal.locator("li").filter({ hasText: "delayed edit" });
  await historyRow.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("500");

  const mutationCaptured = Promise.withResolvers<void>();
  const mutationReleased = Promise.withResolvers<void>();
  let mutationUrl: string | null = null;
  await page.route(`${firstHistoryUrl}/*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    mutationUrl = route.request().url();
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
  const secondAddResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url() === secondAddUrl,
  );
  const saveButton = modal.locator('button[type="submit"]');
  await saveButton.click();
  await expect(saveButton).toBeDisabled();
  expect(secondAddRequestCount).toBe(0);

  const mutationDelivered = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      mutationUrl != null &&
      response.url() === mutationUrl,
  );
  mutationReleased.resolve();
  expect((await mutationDelivered).ok()).toBe(true);
  expect((await secondAddResponse).ok()).toBe(true);
  await expect(modal).toBeHidden();
  expect(secondAddRequestCount).toBe(1);
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
