import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  saveDayEntrySuccessfully,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, getCurrentJstDate } from "./dashboard-shared";

configureDashboardDayEntryE2E();

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test(`completes the integrated budget journey at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const today = getCurrentJstDate();
    const start = addDays(today, -30);
    const end = addDays(today, -1);
    const day = addDays(today, -2);
    const nextEnd = addDays(today, 29);
    const extendedEnd = addDays(today, 30);
    const periodId = "journey-past";
    const nextId = "journey-next";
    const memo = "統合フローの買い物";
    const currentRange = page.getByRole("paragraph").filter({
      hasText: /^\d{4}-\d{2}-\d{2} - \d{4}-\d{2}-\d{2}$/,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${getBaseUrl()}/`);
    await expect(page.getByTestId("create-period-panel")).toBeVisible();
    await page.getByLabel("期間ID", { exact: true }).fill(periodId);
    await page.getByTestId("initial-period-range-start").fill(start);
    await page.getByTestId("initial-period-range-end").fill(end);
    await page.getByLabel("新規予算額 (円)").fill("120000");
    await page.getByRole("button", { name: "期間を作成", exact: true }).click();
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
    await expect(currentRange).toHaveText(`${start} - ${end}`);
    await expect(page.getByTestId("budget-value")).toContainText("120,000");

    const dayButton = page.getByTestId(`calendar-day-${day}`);
    await page.getByTestId(`calendar-day-${end}`).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(dayButton).toBeFocused();
    await page.keyboard.press("Enter");
    const modal = page.getByTestId("day-entry-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(`対象日: ${day}`);
    await expect(modal.getByText("履歴を読み込み中...")).toBeHidden();
    await modal.getByLabel("入力額 (円)").fill("2000");
    await modal.getByLabel("メモ").fill(memo);
    await expect(modal.getByLabel("入力前後の試算")).toContainText("2,000 円");
    await saveDayEntrySuccessfully({ page, modal, periodId, date: day });
    await expect(dayButton).toBeFocused();
    await expect(dayButton.getByTestId(`used-${day}`)).toHaveText("2000 円");
    await dayButton.press("Enter");
    const row = modal.getByRole("listitem").filter({ hasText: memo });
    const editingRow = modal.locator("li.editing");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "編集", exact: true }).click();
    await editingRow.getByLabel("入力額 (円)").fill("1500");
    await editingRow
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(dayButton.getByTestId(`used-${day}`)).toHaveText("2000 円");
    await row.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editingRow.getByLabel("入力額 (円)")).toHaveValue("2000");
    await editingRow.getByLabel("入力額 (円)").fill("1500");
    await editingRow.getByRole("button", { name: "保存", exact: true }).click();
    await expect(row.getByRole("status")).toContainText("履歴を更新しました。");
    await expect(dayButton.getByTestId(`used-${day}`)).toHaveText("1500 円");
    await row.getByRole("button", { name: "削除", exact: true }).click();
    await row.getByRole("button", { name: "取消", exact: true }).click();
    await expect(
      row.getByRole("button", { name: "編集", exact: true }),
    ).toBeVisible();
    await expect(dayButton.getByTestId(`used-${day}`)).toHaveText("1500 円");
    await row.getByRole("button", { name: "削除", exact: true }).click();
    await row.getByRole("button", { name: "削除を確定", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(
      modal.getByText("履歴はまだありません。", { exact: true }),
    ).toBeVisible();
    await expect(dayButton.getByTestId(`used-${day}`)).toHaveText("0 円");
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(dayButton).toBeFocused();

    await page
      .getByText("期間の終了日や予算を変更する", { exact: true })
      .click();
    const budget = page.getByRole("region", { name: "予算設定", exact: true });
    await budget.getByLabel("期間予算 (円)").fill("130000");
    await budget
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(budget.getByLabel("期間予算 (円)")).toHaveValue("120000");
    await expect(page.getByTestId("budget-value")).toContainText("120,000");
    await budget.getByLabel("期間予算 (円)").fill("130000");
    await budget
      .getByRole("button", { name: "期間を更新", exact: true })
      .click();
    await expect(budget.getByRole("status")).toHaveText("予算を保存しました。");
    await expect(page.getByTestId("budget-value")).toContainText("130,000");

    await page.getByText("次の予算期間を作成する", { exact: true }).click();
    await page.getByLabel("期間ID", { exact: true }).fill(nextId);
    await page.getByTestId("create-period-range-start").fill(today);
    await page.getByTestId("create-period-range-end").fill(nextEnd);
    await page.getByLabel("新規予算額 (円)").fill("90000");
    await page.getByRole("button", { name: "期間を作成", exact: true }).click();
    const select = page.getByTestId("period-select");
    await expect(select).toHaveValue(nextId);
    await expect(page.getByTestId("budget-value")).toContainText("90,000");
    await expect(page.getByTestId("today-food-used")).toContainText("0 円");
    await select.selectOption(periodId);
    await expect(page.getByTestId("period-id")).toContainText(periodId);
    await expect(page.getByTestId("budget-value")).toContainText("130,000");
    await dayButton.click();
    await expect(
      modal.getByText("履歴はまだありません。", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await select.selectOption(nextId);
    await expect(page.getByTestId("period-id")).toContainText(nextId);

    const range = page.getByRole("form", { name: "期間設定", exact: true });
    if (!(await range.isVisible())) {
      await page
        .getByText("期間の終了日や予算を変更する", { exact: true })
        .click();
    }
    const rangeEnd = range.getByTestId("current-period-range-end");
    const apply = range.getByTestId("current-period-range-apply");
    await rangeEnd.fill(extendedEnd);
    await range
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(rangeEnd).toHaveValue(nextEnd);
    await rangeEnd.fill(extendedEnd);
    await apply.click();
    await expect(currentRange).toHaveText(`${today} - ${extendedEnd}`);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveCount(0);

    await select.selectOption(periodId);
    await expect(page.getByTestId("period-id")).toContainText(periodId);
    await rangeEnd.fill(today);
    await apply.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`期間ID: ${periodId}`);
    await expect(dialog).toContainText(`期間ID: ${nextId}`);
    await expect(dialog).toContainText(`${start} ～ ${end}`);
    await expect(dialog).toContainText(`${start} ～ ${today}`);
    await expect(dialog).toContainText(`${today} ～ ${extendedEnd}`);
    await expect(dialog).toContainText(
      `${addDays(today, 1)} ～ ${extendedEnd}`,
    );
    await dialog
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(rangeEnd).toHaveValue(end);
    await select.selectOption(nextId);
    await expect(currentRange).toHaveText(`${today} - ${extendedEnd}`);
    await select.selectOption(periodId);
    await expect(rangeEnd).toHaveValue(end);
    await rangeEnd.fill(today);
    await apply.click();
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("linked-proposal.png"),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "変更する", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(currentRange).toHaveText(`${start} - ${today}`);
    await page.reload();
    await expect(currentRange).toHaveText(`${start} - ${today}`);
    await expect(page.getByTestId("budget-value")).toContainText("130,000");
    await select.selectOption(nextId);
    await expect(currentRange).toHaveText(
      `${addDays(today, 1)} - ${extendedEnd}`,
    );
    await page.reload();
    await expect(select).toHaveValue(periodId);
    await select.selectOption(nextId);
    await expect(currentRange).toHaveText(
      `${addDays(today, 1)} - ${extendedEnd}`,
    );
    await expect(page.getByTestId("budget-value")).toContainText("90,000");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("completed-journey.png"),
      fullPage: true,
    });
  });
}
