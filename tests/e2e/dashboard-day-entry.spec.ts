import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  fetchPeriodSummary,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

test("supports add and history row edit in day modal, and keeps values after reload", async ({
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
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();
  await modal.getByLabel("入力額 (円)").fill("2000");
  const longMemo =
    "週末用のまとめ買いメモです。野菜、肉、魚、調味料、冷凍食品、飲み物、朝食用の食材まで含めて、100文字を超える内容でも保存できることを確認します。";
  await modal.getByLabel("メモ").fill(longMemo);
  await expect(modal.getByText("上書き")).toHaveCount(0);
  await modal.getByRole("button", { name: "保存する" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("2000 円");

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(modal.getByLabel("入力額 (円)")).toBeVisible();
  await expect(modal.getByText(longMemo)).toBeVisible();
  const historyRow = modal.locator("li").filter({ hasText: longMemo });
  await historyRow.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("1e3");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("1000 円");

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("1000 円");
});

test("deletes history rows and keeps recalculated values after reload", async ({
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

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = page.getByTestId("day-entry-modal");
  for (const inputYen of ["1000", "2000"]) {
    await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
    await expect(modal).toBeVisible();
    await modal.getByLabel("入力額 (円)").fill(inputYen);
    await modal.getByRole("button", { name: "保存する" }).click();
  }
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("3000 円");

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  const deleteRow = modal.locator("li").filter({ hasText: "入力 1000 円" });
  await deleteRow.getByRole("button", { name: "削除" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("2000 円");
  await expect(deleteRow).toHaveCount(0);

  const lastRow = modal.locator("li").filter({ hasText: "入力 2000 円" });
  await lastRow.getByRole("button", { name: "削除" }).click();
  await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("0 円");

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("0 円");
});

test("shows history edit and delete controls on mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = page.getByTestId("day-entry-modal");
  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await modal.getByLabel("入力額 (円)").fill("1200");
  await modal.getByRole("button", { name: "保存する" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("1200 円");

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(modal.getByText("上書き")).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "削除" })).toBeVisible();
  await modal.getByRole("button", { name: "編集" }).click();
  await expect(
    modal.getByRole("button", { name: "保存", exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toBeVisible();
});

test("clears history edit state when the modal is closed", async ({
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

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = page.getByTestId("day-entry-modal");
  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await modal.getByLabel("入力額 (円)").fill("1200");
  await modal.getByRole("button", { name: "保存する" }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayRow?.date}`)
      .getByTestId(`used-${todayRow?.date}`),
  ).toHaveText("1200 円");

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await modal.getByRole("button", { name: "編集" }).click();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toBeVisible();
  await modal.getByRole("button", { name: "閉じる" }).click();

  await page.getByTestId(`calendar-day-${todayRow?.date}`).click();
  await expect(modal.getByRole("button", { name: "編集" })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "削除" })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toHaveCount(
    0,
  );
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
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const targetRow = summary.dailyRows.find((row) => row.label === "today");
  expect(targetRow).toBeDefined();

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${targetRow?.date}/add`,
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

  await page.getByTestId(`calendar-day-${targetRow?.date}`).click();
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
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const targetRow = summary.dailyRows.find((row) => row.label === "today");
  expect(targetRow).toBeDefined();

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${targetRow?.date}/history`,
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

  await page.getByTestId(`calendar-day-${targetRow?.date}`).click();

  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(page.getByRole("button", { name: "保存する" })).toBeEnabled();
});
