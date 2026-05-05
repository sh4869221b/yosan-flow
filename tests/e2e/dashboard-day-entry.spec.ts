import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  fetchPeriodSummary,
  getBaseUrl,
  getCurrentJstDate,
  startDevServer,
  stopDevServer,
  warmUpBrowser,
} from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser }, testInfo) => {
  testInfo.setTimeout(120_000);
  await stopDevServer();
  await startDevServer();
  await warmUpBrowser(browser);
});

test.afterEach(async () => {
  await stopDevServer();
});

test("supports add and overwrite in day modal, and keeps values after reload", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();

  await page.goto(`${getBaseUrl()}/`);
  await expect(
    page.getByTestId(`calendar-day-${todayRow?.date}`),
  ).toBeVisible();

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("2000");
  const longMemo =
    "週末用のまとめ買いメモです。野菜、肉、魚、調味料、冷凍食品、飲み物、朝食用の食材まで含めて、100文字を超える内容でも保存できることを確認します。";
  await page.getByLabel("メモ").fill(longMemo);
  await page.getByLabel("追加").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("2000 円");

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(page.getByLabel("入力額 (円)")).toBeVisible();
  await expect(page.getByText(longMemo)).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("500");
  await page.getByLabel("上書き").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("500 円");

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("500 円");
});

test("shows save error and keeps input on failed period update", async ({
  page,
  request,
}) => {
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/`);
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
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();

  await page.goto(`${getBaseUrl()}/`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayRow?.date}/add`,
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

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("2000");
  await page.getByLabel("追加").check();
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
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();

  await page.goto(`${getBaseUrl()}/`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayRow?.date}/history`,
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

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();

  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(page.getByRole("button", { name: "保存する" })).toBeEnabled();
});
