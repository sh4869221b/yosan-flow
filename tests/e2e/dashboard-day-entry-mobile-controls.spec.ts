import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("fits and scrolls the entry sheet across viewport sizes", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });

  await page.screenshot({ path: testInfo.outputPath("entry-390.png") });
  for (const width of [375, 760, 761, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("Missing entry sheet");
    if (width <= 760) {
      expect(bounds.x).toBeCloseTo(0, 0);
      expect(bounds.width).toBeCloseTo(width, 0);
      expect(bounds.y + bounds.height).toBeCloseTo(844, 0);
    } else {
      expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(422, 0);
    }
  }

  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await modal.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.body.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const title = modal.getByRole("heading", {
    name: `日次入力 対象日: ${todayDate}`,
  });
  const amount = modal.getByLabel("入力額 (円)");
  const close = modal.getByRole("button", { name: "閉じる" });
  const save = modal.getByRole("button", { name: "保存する" });
  for (const element of [title, amount, close, save]) {
    await element.scrollIntoViewIfNeeded();
    const within = await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const sheet = node.closest('[role="dialog"]')!.getBoundingClientRect();
      return (
        rect.top >= sheet.top &&
        rect.bottom <= sheet.bottom &&
        rect.left >= 0 &&
        rect.right <= innerWidth
      );
    });
    expect(within).toBe(true);
  }
  const buttons = await Promise.all([close.boundingBox(), save.boundingBox()]);
  expect(buttons[0]!.width).toBeCloseTo(buttons[1]!.width, 0);
  expect(buttons[0]!.height).toBeGreaterThanOrEqual(48);
  expect(buttons[1]!.height).toBeGreaterThanOrEqual(48);
  expect(buttons[0]!.y).toBeLessThan(buttons[1]!.y);
  await page.screenshot({ path: testInfo.outputPath("entry-320-bottom.png") });
  await close.click();
  await expect(modal).toBeHidden();
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await amount.fill("1200");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "small sheet save",
  });
  await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("1200 円");
});

test("shows history edit and delete controls on mobile", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("入力額 (円)").fill("1200");
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "mobile controls setup",
  });
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1200 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByText("上書き")).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "編集" })).toBeVisible();
  await expect(modal.getByRole("button", { name: "削除" })).toBeVisible();
  await modal.getByRole("button", { name: "編集" }).click();
  await expect(
    modal.getByRole("button", { name: "保存", exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole("button", { name: "キャンセル" })).toBeVisible();
});
