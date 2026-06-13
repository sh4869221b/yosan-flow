import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("supports add and history row edit in day modal, and keeps values after reload", async ({
  page,
  request,
}) => {
  const { todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/`);
  await expect(page.getByTestId(`calendar-day-${todayDate}`)).toBeVisible();

  await page.getByTestId(`calendar-day-${todayDate}`).click();
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
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByLabel("入力額 (円)")).toBeVisible();
  await expect(modal.getByText(longMemo)).toBeVisible();
  const historyRow = modal.locator("li").filter({ hasText: longMemo });
  await historyRow.getByRole("button", { name: "編集" }).click();
  const editingRow = modal.locator("li.editing");
  await editingRow.getByLabel("入力額 (円)").fill("");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(editingRow).toBeVisible();

  await editingRow.getByLabel("入力額 (円)").fill("1e3");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(editingRow).toBeVisible();

  await editingRow.getByLabel("入力額 (円)").fill("1000abc");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("2000 円");
  await expect(editingRow).toBeVisible();

  await editingRow.getByLabel("入力額 (円)").fill("1000");
  await editingRow.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1000 円");

  await page.reload();
  await expect(
    page
      .getByTestId(`calendar-day-${todayDate}`)
      .getByTestId(`used-${todayDate}`),
  ).toHaveText("1000 円");
});
