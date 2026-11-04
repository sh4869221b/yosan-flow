import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("supports add and history row edit in day modal, and keeps values after reload", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  await modal.getByLabel("追加する支出額 (円)").fill("2000");
  const longMemo =
    "週末用のまとめ買いメモです。野菜、肉、魚、調味料、冷凍食品、飲み物、朝食用の食材まで含めて、100文字を超える内容でも保存できることを確認します。";
  await modal.getByLabel("メモ").fill(longMemo);
  await expect(modal.getByText("追加後の日計")).toBeVisible();
  await expect(modal.getByText("2,000 円", { exact: true })).toBeVisible();
  const flowOrder = await modal.evaluate((element) => {
    const amount = element.querySelector<HTMLInputElement>("#day-entry-amount");
    const memo = element.querySelector<HTMLTextAreaElement>("#day-entry-memo");
    const preview = element.querySelector<HTMLElement>(
      '[aria-label="追加前後の日計の試算"]',
    );
    const save = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("支出を追加") === true,
    );
    if (amount == null || memo == null || preview == null || save == null) {
      return null;
    }
    return [amount, memo, preview, save].every(
      (node, index, nodes) =>
        index === 0 ||
        Boolean(
          nodes[index - 1]?.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    );
  });
  expect(flowOrder).toBe(true);
  await expect(modal.getByText("上書き")).toHaveCount(0);
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "initial add before history edit",
  });
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByLabel("追加する支出額 (円)")).toBeVisible();
  await expect(modal.getByText(longMemo)).toBeVisible();
  const historyRow = modal.locator("li").filter({ hasText: longMemo });
  const editButton = historyRow.getByRole("button", { name: "編集" });
  await editButton.click();
  const editingRow = modal.locator("li.editing");
  const editAmount = editingRow.getByLabel("入力額 (円)");
  await expect(editAmount).toBeFocused();
  for (const input of ["", "1e3", "1000abc"]) {
    await editAmount.fill(input);
    await editingRow.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      page
        .getByTestId(`calendar-day-${todayDate}`)
        .getByTestId(`used-${todayDate}`),
    ).toHaveText("2000 円");
    await expect(editingRow).toBeVisible();
  }
  await expect(editAmount).toHaveAttribute("aria-invalid", "true");
  await expect(editAmount).toHaveAttribute("aria-describedby", /history-edit-/);
  await expect(editingRow.getByRole("alert")).toContainText(
    "入力額は 0 以上の整数で入力してください。",
  );
  await expect(editAmount).toBeFocused();

  await editingRow.getByLabel("入力額 (円)").fill("1000");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1000 円");
  await expect(editButton).toBeFocused();
  await expect(historyRow.getByRole("status")).toContainText(
    "履歴を更新しました。",
  );

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1000 円");
});

test("explains addition and avoids a numeric preview for invalid input", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  const amount = modal.getByLabel("追加する支出額 (円)");
  await expect(
    modal.getByText("追加する金額を入力すると日計を試算します。"),
  ).toBeVisible();
  await amount.fill("1e3");
  await expect(
    modal.getByText("正しい金額を入力すると日計を試算できます。"),
  ).toBeVisible();
  await expect(modal.locator("details")).toHaveCount(0);
  await amount.fill("800");
  await expect(modal.locator(".addition-equation")).toHaveText(
    "現在 0 円 ＋ 今回の追加 800 円 ＝ 日計 800 円",
  );
  await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await amount.fill("0");
  await expect(modal.locator(".addition-equation")).toHaveText(
    "現在 800 円 ＋ 今回の追加 0 円 ＝ 日計 800 円",
  );
  await amount.fill("500");
  await expect(modal.locator(".addition-equation")).toHaveText(
    "現在 800 円 ＋ 今回の追加 500 円 ＝ 日計 1,300 円",
  );
  await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
  await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("1300 円");
});
