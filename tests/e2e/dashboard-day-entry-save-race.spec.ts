import { expect, test } from "@playwright/test";
import {
  clickSaveAndWaitForDayEntryAddResponse,
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("refreshes a reopened same-day modal after the pending save completes", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const addUrl = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`;
  const saveIntercepted = Promise.withResolvers<void>();
  const saveReleased = Promise.withResolvers<void>();

  await page.route(`**${addUrl}`, async (route) => {
    saveIntercepted.resolve();
    await saveReleased.promise;
    await route.continue();
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("pending save");
  await modal.getByRole("button", { name: "保存する" }).click();
  await saveIntercepted.promise;

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal).toBeVisible();
  await modal.getByLabel("入力額 (円)").fill("3000");
  await modal.getByLabel("メモ").fill("new session");
  saveReleased.resolve();

  await expect(modal.getByText("pending save")).toBeVisible();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("3000");
  await expect(modal.getByLabel("メモ")).toHaveValue("new session");
  await expect(modal).toBeVisible();
});

test("does not start an old-day history refresh after switching days", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const summaryUrl = `/api/periods/${encodeURIComponent(periodId)}`;
  const oldHistoryUrl = `${summaryUrl}/days/${encodeURIComponent(todayDate)}/history`;
  const summaryIntercepted = Promise.withResolvers<void>();
  const summaryReleased = Promise.withResolvers<void>();
  let oldHistoryRequests = 0;

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await page.route(`**${summaryUrl}`, async (route) => {
    summaryIntercepted.resolve();
    await summaryReleased.promise;
    await route.continue();
  });
  await page.route(`**${oldHistoryUrl}`, async (route) => {
    oldHistoryRequests += 1;
    await route.continue();
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  const saveResponse = await clickSaveAndWaitForDayEntryAddResponse({
    page,
    modal,
    periodId,
    date: todayDate,
  });
  expect(saveResponse.ok()).toBe(true);
  await summaryIntercepted.promise;

  await page.getByTestId(`calendar-day-${secondDate}`).click();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  summaryReleased.resolve();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");

  expect(oldHistoryRequests).toBe(0);
  await expect(modal).toContainText(`対象日: ${secondDate}`);
});

test("keeps a newer day-entry modal open when an older save finishes", async ({
  page,
  request,
}) => {
  // Given: the first modal has finished its initial history load, and only the
  // history refresh caused by saving will be held behind the barrier.
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const historyUrl = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history`;

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });

  let intercepted = 0;
  let released = 0;
  let signalIntercepted: (() => void) | undefined;
  let releaseHistory: (() => void) | undefined;
  const historyIntercepted = new Promise<void>((resolve) => {
    signalIntercepted = resolve;
  });
  const historyReleased = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });

  await page.route(`**${historyUrl}`, async (route) => {
    intercepted += 1;
    signalIntercepted?.();
    await historyReleased;
    await route.continue();
    released += 1;
  });

  // When: the old save reaches its held history refresh, then the user opens a
  // newer modal session before that old refresh is allowed to complete.
  await modal.getByLabel("入力額 (円)").fill("2000");
  const response = await clickSaveAndWaitForDayEntryAddResponse({
    page,
    modal,
    periodId,
    date: todayDate,
  });
  expect(response.ok()).toBe(true);
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await historyIntercepted;
  expect(intercepted).toBe(1);
  expect(released).toBe(0);

  await page.getByTestId(`calendar-day-${secondDate}`).click();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();
  await modal.getByLabel("入力額 (円)").fill("3000");
  await modal.getByLabel("メモ").fill("newer session");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: secondDate,
    responseAssertionContext: "newer modal session",
  });
  await expect(
    page
      .getByTestId(`calendar-day-${secondDate}`)
      .getByTestId(`used-${secondDate}`),
  ).toHaveText("3000 円");

  // Then: releasing the older save must not overwrite the completed newer save.
  releaseHistory?.();
  await expect.poll(() => released).toBe(1);
  await expect(modal).toBeHidden();
  await page.getByTestId(`calendar-day-${secondDate}`).click();
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await expect(modal.getByText("newer session")).toBeVisible();
  expect(intercepted).toBe(1);
  expect(released).toBe(1);
});
