import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  isExactDayEntryAddResponse,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("opens a modal surface with one scroll owner", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);

  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  const title = modal.getByRole("heading", {
    name: `日次入力 対象日: ${todayDate}`,
  });
  await expect(modal).toHaveAttribute("role", "dialog");
  await expect(modal).toHaveAttribute("aria-modal", "true");
  await expect(title).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(modal.getByLabel("入力額 (円)")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(modal.getByRole("button", { name: "保存する" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(modal.getByLabel("入力額 (円)")).toBeFocused();

  const flowOrder = await modal.evaluate((element) => {
    const form = element.querySelector("form.entry-form");
    const preview = element.querySelector('[aria-label="入力前後の試算"]');
    const actions = element.querySelector(".actions");
    const history = element.querySelector(
      "[aria-labelledby='day-entry-history-heading']",
    );
    if (form == null || preview == null || actions == null || history == null) {
      return false;
    }
    return [form, preview, actions, history].every(
      (node, index, nodes) =>
        index === 0 ||
        Boolean(
          nodes[index - 1]?.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    );
  });
  expect(flowOrder).toBe(true);
  await expect(
    modal.locator("[aria-labelledby='day-entry-history-heading']"),
  ).toBeVisible();
  await expect(modal.locator("#day-entry-history-heading")).toHaveText(
    "履歴表示",
  );
  await expect
    .poll(() =>
      modal.evaluate((element) => {
        const nestedScrollOwner = Array.from(
          element.querySelectorAll<HTMLElement>("div, section"),
        ).some((node) => {
          const style = getComputedStyle(node);
          return (
            (style.overflowY === "auto" || style.overflowY === "scroll") &&
            node !== element
          );
        });
        return {
          nestedScrollOwner,
          overflowY: getComputedStyle(element).overflowY,
        };
      }),
    )
    .toEqual({ nestedScrollOwner: false, overflowY: "auto" });
  await page.screenshot({
    path: "test-results/issue-350/task-3-desktop.png",
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal).toBeVisible();
  await expect(title).toBeFocused();
  await expect
    .poll(() =>
      modal.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          bottom: style.bottom,
          position: style.position,
          transform: style.transform,
        };
      }),
    )
    .toEqual({ bottom: "0px", position: "fixed", transform: "none" });
  await page.screenshot({
    path: "test-results/issue-350/task-3-mobile.png",
    fullPage: true,
  });
});

test("blocks dismissal and resubmission while saving", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const addPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`;
  const addUrl = new URL(addPath, getBaseUrl()).href;
  const saveIntercepted = Promise.withResolvers<void>();
  const releaseSave = Promise.withResolvers<void>();
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
    saveIntercepted.resolve();
    await releaseSave.promise;
    await route.continue();
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);

  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  expect(addRequestCount).toBe(0);

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await modal.getByLabel("入力額 (円)").fill("1200");
  await modal.getByRole("button", { name: "保存する" }).click();
  await saveIntercepted.promise;

  await expect(modal.getByRole("status")).toContainText(
    "保存中です。処理が完了するまで閉じられません。",
  );
  await expect(modal.getByRole("button", { name: "保存中..." })).toBeDisabled();
  await expect(modal.getByRole("button", { name: "閉じる" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);
  await modal.getByLabel("入力額 (円)").press("Enter");

  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${todayDate}`);
  expect(addRequestCount).toBe(1);
  releaseSave.resolve();
  await expect(modal).toBeHidden();
});

test("returns focus to the calendar origin and announces an accepted save", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/history`;
  const historyUrl = new URL(historyPath, getBaseUrl()).href;
  const addPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(todayDate)}/add`;
  const addUrl = new URL(addPath, getBaseUrl()).href;
  const origin = page.getByTestId(`calendar-day-${todayDate}`);
  const modal = page.getByTestId("day-entry-modal");
  const status = page.getByTestId("day-entry-save-status");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await origin.focus();
  const initialHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && response.url() === historyUrl,
  );
  await origin.press("Enter");
  await expect(modal).toBeVisible();
  expect((await initialHistoryResponse).ok()).toBe(true);

  await modal.getByLabel("入力額 (円)").fill("1200");
  await modal.getByLabel("メモ").fill("昼食");
  const saveResponse = page.waitForResponse((response) =>
    isExactDayEntryAddResponse(response, addUrl),
  );
  await modal.getByLabel("入力額 (円)").press("Enter");
  expect((await saveResponse).ok()).toBe(true);
  await expect(modal).toBeHidden();
  await expect(origin).toBeFocused();
  await expect(status).toHaveText(`${todayDate} の支出を保存しました。`);
  await page.screenshot({
    path: "test-results/issue-350/task-4-focus-status.png",
    fullPage: true,
  });

  const reopenedHistoryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && response.url() === historyUrl,
  );
  await origin.press("Enter");
  await expect(modal).toBeVisible();
  expect((await reopenedHistoryResponse).ok()).toBe(true);
  await expect(status).toHaveCount(0);
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("");
  await expect(modal.getByLabel("メモ")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(origin).toBeFocused();
  await expect(status).toHaveCount(0);

  await origin.press("Enter");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "閉じる" }).click();
  await expect(modal).toBeHidden();
  await expect(origin).toBeFocused();
  await expect(status).toHaveCount(0);
});

test("falls back to the calendar heading when its origin is removed", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const origin = page.getByTestId(`calendar-day-${todayDate}`);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await origin.focus();
  await origin.press("Enter");
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();

  await origin.evaluate((button) => button.remove());
  await modal.getByRole("button", { name: "閉じる" }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#period-calendar-heading")).toBeFocused();
});
