import { expect, test } from "@playwright/test";
import {
  clickSaveAndWaitForDayEntryAddResponse,
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("keeps the fullest concurrent add summary when reconciliation fails", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const firstAddPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`;
  const firstAddUrl = new URL(firstAddPath, getBaseUrl()).href;
  const summaryPath = `/api/periods/${encodeURIComponent(periodId)}`;
  const firstAddIntercepted = Promise.withResolvers<void>();
  const firstAddReleased = Promise.withResolvers<void>();
  const failedRefreshObserved = Promise.withResolvers<void>();

  await page.route(`**${firstAddPath}`, async (route) => {
    firstAddIntercepted.resolve();
    await firstAddReleased.promise;
    await route.continue();
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await page.route(`**${summaryPath}`, async (route) => {
    failedRefreshObserved.resolve();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "refresh unavailable" } }),
    });
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByRole("button", { name: "保存する" }).click();
  await firstAddIntercepted.promise;

  await page.getByTestId(`calendar-day-${secondDate}`).click();
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await modal.getByLabel("入力額 (円)").fill("3000");
  const secondResponse = await clickSaveAndWaitForDayEntryAddResponse({
    page,
    modal,
    periodId,
    date: secondDate,
  });
  expect(secondResponse.ok()).toBe(true);

  const firstResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url() === firstAddUrl,
  );
  firstAddReleased.resolve();
  const firstResponse = await firstResponsePromise;
  expect(firstResponse.ok()).toBe(true);
  await failedRefreshObserved.promise;

  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(
    page
      .getByTestId(`calendar-day-${secondDate}`)
      .getByTestId(`used-${secondDate}`),
  ).toHaveText("3000 円");
});
