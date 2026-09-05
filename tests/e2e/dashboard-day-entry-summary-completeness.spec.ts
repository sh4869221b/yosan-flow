import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("suppresses a concurrent submit and completes the accepted save", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const addPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`;
  const addUrl = new URL(addPath, getBaseUrl()).href;
  const addIntercepted = Promise.withResolvers<void>();
  const addReleased = Promise.withResolvers<void>();
  let addRequestCount = 0;

  await page.route(`**${addPath}`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().url() !== addUrl
    ) {
      await route.continue();
      return;
    }
    addRequestCount += 1;
    addIntercepted.resolve();
    await addReleased.promise;
    await route.continue();
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByRole("button", { name: "保存する" }).click();
  await addIntercepted.promise;

  await modal.getByLabel("入力額 (円)").press("Enter");
  await expect(modal).toBeVisible();
  expect(addRequestCount).toBe(1);
  const addResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url() === addUrl,
  );
  addReleased.resolve();
  expect((await addResponse).ok()).toBe(true);
  await expect(modal).toBeHidden();

  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
});
