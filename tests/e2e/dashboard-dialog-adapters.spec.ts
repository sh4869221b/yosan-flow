import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import {
  assertUnchangedPair,
  countConfirmations,
  gotoTarget,
  proposeBoundaryChange,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";

configureDashboardDayEntryE2E();

const actions = [
  {
    title: "期間の日付や予算を変更する",
    inputLabel: "期間予算 (円)",
    rangeEndId: "current-period-range-end",
    lastAction: "キャンセル",
  },
  {
    title: "次の予算期間を作成する",
    inputLabel: "新規予算額 (円)",
    rangeEndId: "create-period-range-end",
    lastAction: "取り消す",
  },
] as const;

for (const action of actions) {
  test(`preserves the ${action.rangeEndId} draft across the sheet breakpoint`, async ({
    page,
    request,
  }) => {
    const { periodId } = await seedCurrentPeriod(request);
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.goto(
      `${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`,
    );
    await waitForDashboardReady(page);
    const trigger = page.getByRole("button", {
      name: action.title,
      exact: true,
    });
    const sheet = page.getByRole("dialog", {
      name: action.title,
      exact: true,
    });
    const details = page.locator("details").filter({
      has: page.locator("summary", { hasText: action.title }),
    });
    const writes: string[] = [];
    page.on("request", (outgoing) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(outgoing.method()))
        writes.push(outgoing.url());
    });

    await trigger.click();
    await expect(
      sheet.getByRole("heading", { name: action.title }),
    ).toBeFocused();
    await sheet.getByLabel(action.inputLabel).fill("130000");
    await sheet.getByTestId(action.rangeEndId).fill("2026-11-");

    await page.setViewportSize({ width: 761, height: 1000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator("summary")).toBeFocused();
    await expect(page.getByLabel(action.inputLabel)).toHaveCount(1);
    await expect(details.getByLabel(action.inputLabel)).toHaveValue("130000");
    await expect(page.getByTestId(action.rangeEndId)).toHaveCount(1);
    await expect(details.getByTestId(action.rangeEndId)).toHaveValue(
      "2026-11-",
    );

    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: action.title }),
    ).toBeFocused();
    await expect(page.getByLabel(action.inputLabel)).toHaveCount(1);
    await expect(sheet.getByLabel(action.inputLabel)).toHaveValue("130000");
    await expect(page.getByTestId(action.rangeEndId)).toHaveCount(1);
    await expect(sheet.getByTestId(action.rangeEndId)).toHaveValue("2026-11-");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 761, height: 1000 });
    await expect(details).not.toHaveAttribute("open");
    await expect(details.getByLabel(action.inputLabel)).toBeHidden();
    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(sheet).toBeHidden();
    await trigger.click();
    await expect(sheet.getByLabel(action.inputLabel)).toHaveValue("130000");
    await expect(sheet.getByTestId(action.rangeEndId)).toHaveValue("2026-11-");
    expect(writes).toEqual([]);
  });
}

test("keeps an unsaved day entry open after an outside click", async ({
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
  await modal.getByLabel("入力額 (円)").fill("1250");
  await modal.getByLabel("メモ", { exact: true }).fill("unsaved outside click");
  const bounds = await modal.boundingBox();
  expect(bounds?.x).toBeGreaterThan(4);
  await page.mouse.click(4, 4);
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("1250");
  await expect(modal.getByLabel("メモ", { exact: true })).toHaveValue(
    "unsaved outside click",
  );
  await expect(
    modal.getByRole("button", { name: "閉じる", exact: true }),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(page.getByTestId(`calendar-day-${todayDate}`)).toBeFocused();
});

test("keeps action-sheet focus trapped and ignores outside clicks", async ({
  page,
  request,
}) => {
  const { periodId } = await seedCurrentPeriod(request);
  await page.setViewportSize({ width: 760, height: 1800 });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await waitForDashboardReady(page);

  for (const action of actions) {
    const trigger = page.getByRole("button", {
      name: action.title,
      exact: true,
    });
    const sheet = page.getByRole("dialog", {
      name: action.title,
      exact: true,
    });
    await trigger.click();
    await expect(
      sheet.getByRole("heading", { name: action.title }),
    ).toBeFocused();
    const close = sheet.getByRole("button", { name: "閉じる", exact: true });
    await expect(close).toHaveCount(1);
    await sheet.getByTestId(action.rangeEndId).fill("2026-11-");
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    const form = sheet.locator("form").filter({
      has: page.getByTestId(action.rangeEndId),
    });
    await expect(
      form.getByRole("button", { name: action.lastAction, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    const bounds = await sheet.boundingBox();
    expect(bounds?.y).toBeGreaterThan(4);
    await page.mouse.click(4, 4);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId(action.rangeEndId)).toHaveValue("2026-11-");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("routes focus and Escape only to the alert above a settings sheet", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedBoundaryPair(request);
  await gotoTarget(page);
  const confirmations = countConfirmations(page);
  await page
    .getByRole("button", { name: actions[0].title, exact: true })
    .click();
  const sheet = page.getByTestId("period-settings-sheet");
  await sheet.getByLabel("期間予算 (円)").fill("130000");
  await proposeBoundaryChange(page);
  const alert = page.getByRole("alertdialog", {
    name: "予算期間の境界を変更しますか？",
    exact: true,
  });
  const cancel = alert.getByRole("button", { name: "キャンセル", exact: true });
  const confirm = alert.getByRole("button", { name: "変更する", exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(alert).toBeVisible();
  await expect(sheet).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(alert).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("current-period-range-start")).toBeFocused();
  await expect(sheet.getByTestId("current-period-range-end")).toHaveValue(
    target.endDate,
  );
  await expect(sheet.getByLabel("期間予算 (円)")).toHaveValue("130000");
  expect(confirmations()).toBe(0);
  await assertUnchangedPair(request);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("button", { name: actions[0].title, exact: true }),
  ).toBeFocused();
});
