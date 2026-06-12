import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("rejects malformed day-entry yen values before requests", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  let addRequestCount = 0;
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/add`,
    async (route) => {
      addRequestCount += 1;
      await route.continue();
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();

  for (const input of ["", "1e3", "1000abc", "10.5", "-1"]) {
    await modal.getByLabel("入力額 (円)").fill(input);
    await modal.getByRole("button", { name: "保存する" }).click();
    await expect(modal.getByRole("alert")).toContainText(
      "入力額は 0 以上の整数で入力してください。",
    );
    await expect(
      page
        .getByTestId(`calendar-day-${todayDate}`)
        .getByTestId(`used-${todayDate}`),
    ).toHaveText("0 円");
  }

  expect(addRequestCount).toBe(0);
});

test("shows save error and keeps input on failed period update", async ({
  page,
  request,
}) => {
  const { periodId } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByLabel("期間予算 (円)").fill("130000");
  await page.route(`**/api/periods/${periodId}`, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PERIOD_NOT_FOUND",
          message: "対象の予算期間が見つかりません。",
        },
      }),
    });
  });

  await page.getByRole("button", { name: "期間を更新" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
});

test("shows save error and keeps input on failed day entry update", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/add`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_SAVE_FAILURE",
            message: "日次入力の保存に失敗しました。",
          },
        }),
      });
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("2000");
  await page.getByRole("button", { name: "保存する" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "日次入力の保存に失敗しました。",
  );
  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await expect(page.getByLabel("入力額 (円)")).toHaveValue("2000");
});

test("shows history load error while keeping the day entry modal usable", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/history`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_HISTORY_FAILURE",
            message: "履歴の取得に失敗しました。",
          },
        }),
      });
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();

  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(page.getByRole("button", { name: "保存する" })).toBeEnabled();
});
