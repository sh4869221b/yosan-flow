import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

async function seedHistory(
  request: APIRequestContext,
  periodId: string,
  date: string,
  memo: string,
): Promise<void> {
  const response = await request.post(
    `${getBaseUrl()}/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/add`,
    { data: { inputYen: 1_200, memo } },
  );
  expect(response.ok()).toBe(true);
}

async function openHistoryWithEntries(
  page: Page,
  periodId: string,
  date: string,
): Promise<Locator> {
  const historyUrl = new URL(
    `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history`,
    getBaseUrl(),
  ).href;
  const historyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && response.url() === historyUrl,
  );
  await page.getByTestId(`calendar-day-${date}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();
  expect((await historyResponse).ok()).toBe(true);
  return modal;
}

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

test("keeps an unsent history edit local and restores its edit button", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const memo = "local edit";
  await seedHistory(request, periodId, todayDate, memo);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const row = modal.locator("li").filter({ hasText: memo });
  const editButton = row.getByRole("button", { name: "編集" });
  let patchCount = 0;
  await page.route("**/history/*", async (route) => {
    if (route.request().method() === "PATCH") {
      patchCount += 1;
    }
    await route.continue();
  });

  await editButton.click();
  const editingRow = modal.locator("li.editing");
  const amount = editingRow.getByLabel("入力額 (円)");
  await expect(amount).toBeFocused();
  await amount.fill("1e3");
  await editingRow.getByLabel("メモ").fill("kept draft");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editingRow.getByRole("alert")).toContainText(
    "入力額は 0 以上の整数で入力してください。",
  );
  await expect(amount).toHaveValue("1e3");
  await expect(editingRow.getByLabel("メモ")).toHaveValue("kept draft");
  await expect(amount).toBeFocused();
  expect(patchCount).toBe(0);

  const cancelButton = editingRow.getByRole("button", { name: "キャンセル" });
  await cancelButton.focus();
  await cancelButton.press("Escape");
  await expect(editButton).toBeFocused();
  await expect(modal).toBeVisible();
  expect(patchCount).toBe(0);
  await editButton.click();
  const saveButton = editingRow.getByRole("button", { name: "保存" });
  await saveButton.focus();
  await saveButton.press("Escape");
  await expect(editButton).toBeFocused();
  expect(patchCount).toBe(0);
  await editButton.press("Escape");
  await expect(modal).toBeHidden();
});

test("keeps a failed history save focused with its draft and submits once", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const memo = "failed history edit";
  await seedHistory(request, periodId, todayDate, memo);
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  const firstPatchRequested = Promise.withResolvers<void>();
  const releaseFirstPatch = Promise.withResolvers<void>();
  const secondPatchRequested = Promise.withResolvers<void>();
  const releaseSecondPatch = Promise.withResolvers<void>();
  let patchCount = 0;
  await page.route(`**${historyPath}*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    patchCount += 1;
    if (patchCount === 1) {
      firstPatchRequested.resolve();
      await releaseFirstPatch.promise;
    } else if (patchCount === 2) {
      secondPatchRequested.resolve();
      await releaseSecondPatch.promise;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ error: {} }),
      status: 503,
    });
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const row = modal.locator("li").filter({ hasText: memo });
  await row.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  const amount = editingRow.getByLabel("入力額 (円)");
  await amount.fill("500");
  await editingRow.getByLabel("メモ").fill("draft on failure");
  await amount.press("Enter");
  await firstPatchRequested.promise;
  await expect(row.getByRole("button", { name: "編集" })).toBeDisabled();
  await expect(row.getByRole("button", { name: "保存" })).toHaveCount(0);
  expect(patchCount).toBe(1);
  releaseFirstPatch.resolve();

  await expect(editingRow.getByRole("alert")).toContainText(
    "履歴の更新に失敗しました。",
  );
  await expect(modal.locator(".history-panel > .error-message")).toHaveCount(0);
  await expect(amount).toHaveValue("500");
  await expect(editingRow.getByLabel("メモ")).toHaveValue("draft on failure");
  await expect(amount).toBeFocused();
  await editingRow.screenshot({
    path: "test-results/issue-351/task2-edit-failure.png",
  });

  await amount.press("Enter");
  await secondPatchRequested.promise;
  const dayEntryAmount = modal.locator("#day-entry-amount");
  await dayEntryAmount.click();
  await dayEntryAmount.fill("321");
  await expect(dayEntryAmount).toBeFocused();
  releaseSecondPatch.resolve();

  await expect(editingRow.getByRole("alert")).toContainText(
    "履歴の更新に失敗しました。",
  );
  await expect(dayEntryAmount).toBeFocused();
  expect(patchCount).toBe(2);
});

test("accepts a same-value save and leaves a newer draft focused", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await seedHistory(request, periodId, todayDate, "first history");
  await seedHistory(request, periodId, todayDate, "second history");
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  const patchCaptured = Promise.withResolvers<void>();
  const releasePatch = Promise.withResolvers<void>();
  await page.route(`**${historyPath}*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    patchCaptured.resolve();
    await releasePatch.promise;
    await route.fulfill({ response });
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const firstRow = modal.locator("li").filter({ hasText: "first history" });
  const secondRow = modal.locator("li").filter({ hasText: "second history" });
  await firstRow.getByRole("button", { name: "編集" }).click();
  const firstEdit = modal.locator("li.editing");
  await firstEdit.getByRole("button", { name: "保存", exact: true }).click();
  await patchCaptured.promise;
  await expect(firstRow.getByRole("status")).toContainText(
    "履歴を更新中です。",
  );

  const secondEditButton = secondRow.getByRole("button", { name: "編集" });
  await expect(secondEditButton).toBeEnabled();
  await secondEditButton.click();
  const secondEdit = modal.locator("li.editing");
  const secondAmount = secondEdit.getByLabel("入力額 (円)");
  await secondAmount.fill("99");
  await expect(secondEdit.getByRole("button", { name: "保存" })).toBeDisabled();
  await expect(secondEdit.getByRole("status")).toContainText(
    "別の履歴を更新中です。",
  );

  releasePatch.resolve();
  await expect(secondAmount).toHaveValue("99");
  await expect(secondAmount).toBeFocused();
  await expect(firstRow.getByText("履歴を更新しました。")).toHaveCount(0);
  await secondEdit.getByRole("button", { name: "キャンセル" }).click();

  await secondEditButton.click();
  await secondEdit.getByRole("button", { name: "保存", exact: true }).click();
  await expect(secondEditButton).toBeFocused();
  await expect(secondRow.getByRole("status")).toContainText(
    "履歴を更新しました。",
  );
  await firstRow.getByRole("button", { name: "編集" }).click();
  await expect(secondRow.getByText("履歴を更新しました。")).toHaveCount(0);
  await secondEdit.getByRole("button", { name: "キャンセル" }).click();
  await page.screenshot({
    path: "test-results/issue-351/task2-edit-success.png",
    fullPage: true,
  });
});

test("keeps history deletion local until confirmation and restores its trigger", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const memo = "confirm before delete";
  await seedHistory(request, periodId, todayDate, memo);
  let deleteCount = 0;
  await page.route("**/history/*", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCount += 1;
    }
    await route.continue();
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const row = modal.locator("li").filter({ hasText: memo });
  const deleteButton = row.getByRole("button", { name: "削除" });
  await deleteButton.click();
  const cancelButton = row.getByRole("button", { name: "取消" });
  await expect(row.getByText("「追加 1200 円」を削除しますか？")).toBeVisible();
  await expect(cancelButton).toBeFocused();
  await page.screenshot({
    path: "test-results/issue-351/task3-delete-confirm-desktop.png",
    fullPage: true,
  });
  await cancelButton.click();
  await expect(deleteButton).toBeFocused();
  expect(deleteCount).toBe(0);

  await deleteButton.click();
  await cancelButton.press("Escape");
  await expect(deleteButton).toBeFocused();
  await expect(modal).toBeVisible();
  expect(deleteCount).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await deleteButton.click();
  await page.screenshot({
    path: "test-results/issue-351/task3-delete-confirm-mobile.png",
    fullPage: true,
  });
  await cancelButton.click();
});

test("retries a failed confirmed deletion once and restores deletion focus", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const memo = "delete retry";
  await seedHistory(request, periodId, todayDate, memo);
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  const deleteRequested = Promise.withResolvers<void>();
  const releaseDelete = Promise.withResolvers<void>();
  let deleteCount = 0;
  await page.route(`**${historyPath}*`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    deleteCount += 1;
    if (deleteCount === 1) {
      deleteRequested.resolve();
      await releaseDelete.promise;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ error: {} }),
        status: 503,
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const row = modal.locator("li").filter({ hasText: memo });
  await row.getByRole("button", { name: "削除" }).click();
  const confirmButton = row.getByRole("button", { name: "削除を確定" });
  await confirmButton.click();
  await deleteRequested.promise;
  await expect(row.getByText("履歴を削除中です。")).toBeVisible();
  await row.getByRole("button", { name: "削除中..." }).dispatchEvent("click");
  expect(deleteCount).toBe(1);
  releaseDelete.resolve();

  await expect(row.getByRole("alert")).toContainText(
    "履歴の削除に失敗しました。",
  );
  await expect(confirmButton).toBeFocused();
  await confirmButton.click();
  await expect(row).toHaveCount(0);
  await expect(modal.getByRole("heading", { name: "履歴表示" })).toBeFocused();
  await expect(modal.getByRole("status")).toContainText("履歴を削除しました。");
  expect(deleteCount).toBe(2);
});

test("restores history delete focus in visible order and ignores a closed session", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await seedHistory(request, periodId, todayDate, "first history");
  await seedHistory(request, periodId, todayDate, "middle history");
  await seedHistory(request, periodId, todayDate, "last history");

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const firstRow = modal.locator("li").filter({ hasText: "first history" });
  const middleRow = modal.locator("li").filter({ hasText: "middle history" });
  const lastRow = modal.locator("li").filter({ hasText: "last history" });
  await middleRow.getByRole("button", { name: "削除" }).click();
  await middleRow.getByRole("button", { name: "削除を確定" }).click();
  await expect(middleRow).toHaveCount(0);
  await expect(firstRow.getByRole("button", { name: "編集" })).toBeFocused();

  await firstRow.getByRole("button", { name: "削除" }).click();
  await firstRow.getByRole("button", { name: "削除を確定" }).click();
  await expect(firstRow).toHaveCount(0);
  await expect(lastRow.getByRole("button", { name: "編集" })).toBeFocused();

  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  const deleteRequested = Promise.withResolvers<void>();
  const releaseDelete = Promise.withResolvers<void>();
  await page.route(`**${historyPath}*`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    deleteRequested.resolve();
    await releaseDelete.promise;
    await route.continue();
  });
  await lastRow.getByRole("button", { name: "削除" }).click();
  await lastRow.getByRole("button", { name: "削除を確定" }).click();
  await deleteRequested.promise;
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal).toBeVisible();
  const dayEntryAmount = modal.locator("#day-entry-amount");
  await dayEntryAmount.focus();
  releaseDelete.resolve();
  await expect(dayEntryAmount).toBeFocused();
  await expect(modal.getByText("履歴を削除しました。")).toHaveCount(0);
});

test("keeps a newer history draft focused after a delayed deletion resolves", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await seedHistory(request, periodId, todayDate, "delayed deletion");
  await seedHistory(request, periodId, todayDate, "newer draft");
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history/`;
  const deleteRequested = Promise.withResolvers<void>();
  const releaseDelete = Promise.withResolvers<void>();
  await page.route(`**${historyPath}*`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    deleteRequested.resolve();
    await releaseDelete.promise;
    await route.continue();
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openHistoryWithEntries(page, periodId, todayDate);
  const deleteRow = modal.locator("li").filter({ hasText: "delayed deletion" });
  const draftRow = modal.locator("li").filter({ hasText: "newer draft" });
  await deleteRow.getByRole("button", { name: "削除" }).click();
  await deleteRow
    .getByRole("button", { name: "削除を確定" })
    .dispatchEvent("click");
  await expect(deleteRow.getByText("履歴を削除中です。")).toBeVisible();
  await deleteRequested.promise;

  await draftRow.getByRole("button", { name: "編集" }).click();
  const draftAmount = modal.locator("li.editing").getByLabel("入力額 (円)");
  await draftAmount.fill("1300");
  await expect(draftAmount).toBeFocused();
  releaseDelete.resolve();

  await expect(deleteRow).toHaveCount(0);
  await expect(draftAmount).toHaveValue("1300");
  await expect(draftAmount).toBeFocused();
  await expect(modal.getByText("履歴を削除しました。")).toHaveCount(0);
});
