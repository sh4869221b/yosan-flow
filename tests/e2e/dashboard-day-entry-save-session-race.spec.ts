import { expect, test } from "@playwright/test";
import {
  clickSaveAndWaitForDayEntryAddResponse,
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("preserves a newer failed modal when an older successful save finishes", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const secondDate = addDays(todayDate, 1);
  const baseUrl = getBaseUrl();
  const oldHistoryUrl = new URL(
    `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history`,
    baseUrl,
  ).href;
  const newHistoryUrl = new URL(
    `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(secondDate)}/history`,
    baseUrl,
  ).href;
  const newAddUrl = new URL(
    `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(secondDate)}/add`,
    baseUrl,
  ).href;

  await page.goto(`${baseUrl}/?periodId=${encodeURIComponent(periodId)}`);
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
  await page.route(oldHistoryUrl, async (route) => {
    intercepted += 1;
    signalIntercepted?.();
    await historyReleased;
    await route.continue();
    released += 1;
  });

  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("old successful session");
  const oldAddResponse = await clickSaveAndWaitForDayEntryAddResponse({
    page,
    modal,
    periodId,
    date: todayDate,
  });
  expect(oldAddResponse.ok()).toBe(true);
  await historyIntercepted;
  expect(intercepted).toBe(1);
  expect(released).toBe(0);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url() === newHistoryUrl &&
        response.ok(),
    ),
    page.getByTestId(`calendar-day-${secondDate}`).click(),
  ]);
  await expect(modal).toContainText(`対象日: ${secondDate}`);
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();
  await expect(
    modal.getByText("入力を保存すると履歴が表示されます。"),
  ).toBeVisible();
  await page.route(newAddUrl, async (route) => {
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
      response.request().method() === "POST" && response.url() === newAddUrl,
  );
  await modal.getByRole("button", { name: "保存する" }).click();
  expect((await newAddResponse).status()).toBe(503);
  await expect(modal.getByRole("alert")).toContainText(
    "新しいセッションの保存に失敗しました。",
  );
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("3100");
  await expect(modal.getByLabel("メモ")).toHaveValue("newer failed session");
  await expect(modal.getByRole("button", { name: "保存する" })).toBeEnabled();

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
