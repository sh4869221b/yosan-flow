import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("keeps a newer day-entry modal open when an older save finishes", async ({
  page,
  request,
}) => {
  // Given: the first modal has finished its initial history load, and only the
  // history refresh caused by saving will be held behind the barrier.
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const historyUrl = `/api/periods/${periodId}/days/${todayDate}/history`;
  const addUrl = `/api/periods/${periodId}/days/${todayDate}/add`;

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === historyUrl &&
        response.ok(),
    ),
    page.getByTestId(`calendar-day-${todayDate}`).click(),
  ]);

  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${todayDate}`);

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
  const addResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === addUrl,
  );
  await modal.getByRole("button", { name: "保存する" }).click();
  const response = await addResponse;
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

test("preserves a newer failed modal when an older successful save finishes", async ({
  page,
  request,
}) => {
  // Given: an older successful save is paused at its post-save history refresh.
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const oldHistoryUrl = `/api/periods/${periodId}/days/${todayDate}/history`;
  const oldAddUrl = `/api/periods/${periodId}/days/${todayDate}/add`;
  const newHistoryUrl = `/api/periods/${periodId}/days/${secondDate}/history`;
  const newAddUrl = `/api/periods/${periodId}/days/${secondDate}/add`;

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === oldHistoryUrl &&
        response.ok(),
    ),
    page.getByTestId(`calendar-day-${todayDate}`).click(),
  ]);
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();

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
  await page.route(`**${oldHistoryUrl}`, async (route) => {
    intercepted += 1;
    signalIntercepted?.();
    await historyReleased;
    await route.continue();
    released += 1;
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("old successful session");
  const oldAddResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === oldAddUrl,
  );
  await modal.getByRole("button", { name: "保存する" }).click();
  expect((await oldAddResponse).ok()).toBe(true);
  await historyIntercepted;
  expect(intercepted).toBe(1);
  expect(released).toBe(0);

  // When: the newer session fails to save while the old success remains held.
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === newHistoryUrl &&
        response.ok(),
    ),
    page.getByTestId(`calendar-day-${secondDate}`).click(),
  ]);
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();
  await expect(
    modal.getByText("入力を保存すると履歴が表示されます。"),
  ).toBeVisible();
  await page.route(`**${newAddUrl}`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TEMPORARY_SAVE_FAILURE",
          message: "新しいセッションの保存に失敗しました。",
        },
      }),
    });
  });
  await modal.getByLabel("入力額 (円)").fill("3100");
  await modal.getByLabel("メモ").fill("newer failed session");
  const newAddResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === newAddUrl,
  );
  await modal.getByRole("button", { name: "保存する" }).click();
  expect((await newAddResponse).status()).toBe(503);
  await expect(modal.getByRole("alert")).toContainText(
    "新しいセッションの保存に失敗しました。",
  );
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("3100");
  await expect(modal.getByLabel("メモ")).toHaveValue("newer failed session");
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();

  // Then: the old completion cannot mutate any state owned by the failed session.
  releaseHistory?.();
  await expect.poll(() => released).toBe(1);
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await expect(modal.getByRole("alert")).toContainText(
    "新しいセッションの保存に失敗しました。",
  );
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("3100");
  await expect(modal.getByLabel("メモ")).toHaveValue("newer failed session");
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();
  await expect(
    modal.getByText("入力を保存すると履歴が表示されます。"),
  ).toBeVisible();
  await expect(modal.getByText("old successful session")).toHaveCount(0);
  expect(intercepted).toBe(1);
  expect(released).toBe(1);
});
