import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("keeps loading and empty history states exclusive", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history`;
  const historyRequested = Promise.withResolvers<void>();
  const releaseHistory = Promise.withResolvers<void>();

  await page.route(`**${historyPath}`, async (route) => {
    historyRequested.resolve();
    await releaseHistory.promise;
    await route.continue();
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await historyRequested.promise;

  const modal = page.getByTestId("day-entry-modal");
  const amount = modal.getByLabel("入力額 (円)");
  await amount.focus();
  await expect(modal.getByRole("status", { name: "" })).toContainText(
    "履歴を読み込み中...",
  );
  await expect(modal.getByText("履歴はまだありません。")).toHaveCount(0);
  await expect(amount).toBeFocused();

  releaseHistory.resolve();
  await expect(modal.getByText("履歴を読み込み中...")).toBeHidden();
  await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
  await expect(amount).toBeFocused();
  await page.screenshot({
    path: "test-results/issue-351/task1-loading-empty.png",
    fullPage: true,
  });
});

test("keeps retry focused through a failed history GET and moves it after success", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history`;
  const historyUrl = new URL(historyPath, getBaseUrl()).href;
  const retryRequested = Promise.withResolvers<void>();
  const releaseRetry = Promise.withResolvers<void>();
  let requestCount = 0;

  await page.route(`**${historyPath}`, async (route) => {
    if (
      route.request().method() !== "GET" ||
      route.request().url() !== historyUrl
    ) {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 2) {
      retryRequested.resolve();
      await releaseRetry.promise;
    }
    if (requestCount < 3) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ error: {} }),
        status: 503,
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ histories: [] }),
      status: 200,
    });
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByTestId(`calendar-day-${todayDate}`).click();

  const modal = page.getByTestId("day-entry-modal");
  const retryButton = modal.getByRole("button", { name: "履歴を再試行" });
  await expect(modal.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(modal.getByLabel("入力額 (円)")).toBeEnabled();
  await expect(modal.getByText("履歴はまだありません。")).toHaveCount(0);

  await retryButton.click();
  await retryRequested.promise;
  const retryingButton = modal.getByRole("button", { name: "再試行中..." });
  await expect(retryingButton).toBeFocused();
  await expect(retryingButton).toHaveAttribute("aria-disabled", "true");
  await retryingButton.dispatchEvent("click");
  expect(requestCount).toBe(2);
  releaseRetry.resolve();

  await expect(modal.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(retryButton).toBeFocused();
  await retryButton.click();

  const heading = modal.getByRole("heading", { name: "履歴表示" });
  await expect(heading).toBeFocused();
  await expect(modal.getByRole("alert")).toHaveCount(0);
  await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
  expect(requestCount).toBe(3);
  await page.screenshot({
    path: "test-results/issue-351/task1-retry-success.png",
    fullPage: true,
  });
});

test("loads a readable history row with wrapping memo", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const memo =
    "週末用のまとめ買いとして野菜、肉、魚、調味料、冷凍食品、飲み物を記録した長いメモです。";
  const response = await request.post(
    `${getBaseUrl()}/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`,
    { data: { inputYen: 1_200, memo } },
  );
  expect(response.ok()).toBe(true);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByTestId(`calendar-day-${todayDate}`).click();

  const modal = page.getByTestId("day-entry-modal");
  const row = modal.locator("li").filter({ hasText: memo });
  await expect(row.getByText("追加", { exact: true })).toBeVisible();
  await expect(row.getByText("入力", { exact: true })).toBeVisible();
  await expect(row.locator(".history-input strong")).toHaveText("1200 円");
  await expect(row.getByText("変更前", { exact: true })).toBeVisible();
  await expect(row.getByText("変更後", { exact: true })).toBeVisible();
  await expect(row.locator(".history-memo")).toContainText(memo);
  await expect(row.locator("time")).toHaveAttribute("datetime", /.+/);
  await expect(row).toHaveCSS("overflow-wrap", "normal");
  await expect(row.locator(".history-memo")).toHaveCSS(
    "overflow-wrap",
    "anywhere",
  );
  await row.scrollIntoViewIfNeeded();
  await row.screenshot({
    path: "test-results/issue-351/task1-readable-row.png",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await row.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      row.evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
  const actionHeights = await row
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
  expect(actionHeights.every((height) => height >= 44)).toBe(true);
  await row.screenshot({
    path: "test-results/issue-351/task1-readable-row-mobile.png",
  });
});
