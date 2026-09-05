import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("rejects malformed day-entry yen values before requests", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  let addRequestCount = 0;
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/add`,
    async (route) => {
      addRequestCount += 1;
      await route.continue();
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();

  for (const input of ["", "1e3", "1000abc", "-1"]) {
    await modal.getByLabel("入力額 (円)").fill(input);
    await modal.getByRole("button", { name: "保存する" }).click();
    await expect(modal.getByRole("alert")).toContainText(
      "入力額は 0 以上の整数で入力してください。",
    );
    await expect(
      page
        .getByTestId(`calendar-day-${todayDate}`)
        .getByTestId(`used-${todayDate}`),
    ).toHaveText("0 円");
  }

  const memo = "小数入力でも保持されるメモ";
  const amountInput = modal.getByLabel("入力額 (円)");
  await amountInput.fill("1.5");
  await modal.getByLabel("メモ").fill(memo);
  await modal.getByRole("button", { name: "保存する" }).click();

  await expect(amountInput).toBeFocused();
  await expect(amountInput).toHaveValue("1.5");
  await expect(modal.getByLabel("メモ")).toHaveValue(memo);
  await expect(amountInput).toHaveAttribute("aria-invalid", "true");
  const describedBy = await amountInput.getAttribute("aria-describedby");
  expect(describedBy).toBe("day-entry-amount-error");
  await expect(modal.locator(`#${describedBy}`)).toHaveAttribute(
    "role",
    "alert",
  );

  await amountInput.fill("1200");
  await expect(amountInput).toHaveAttribute("aria-invalid", "false");
  await expect(modal.locator("#day-entry-amount-error")).toHaveCount(0);

  expect(addRequestCount).toBe(0);
});

test("shows save error and keeps input on failed period update", async ({
  page,
  request,
}) => {
  const { periodId } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByLabel("期間予算 (円)").fill("130000");
  await page.route(`**/api/periods/${periodId}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "PERIOD_NOT_FOUND",
          message: "対象の予算期間が見つかりません。",
        },
      }),
    });
  });

  const reconcileBarrier = Promise.withResolvers<void>();
  let reconcileGetCount = 0;
  await page.route(`${getBaseUrl()}/api/periods`, async (route) => {
    expect(route.request().method()).toBe("GET");
    reconcileGetCount += 1;
    await reconcileBarrier.promise;
    await route.continue();
  });

  await page.getByRole("button", { name: "期間を更新" }).click();

  await expect.poll(() => reconcileGetCount).toBe(1);

  const budgetSettings = page.getByRole("region", { name: "予算設定" });
  await expect(budgetSettings.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
  await expect(page.getByTestId("budget-value")).toContainText("120,000");
  await expect(
    budgetSettings.locator("xpath=ancestor::details"),
  ).toHaveAttribute("open", "");
  await expect(page.locator("#dashboard-heading")).not.toBeFocused();
  await expect(page.locator("#selected-period-heading")).not.toBeFocused();

  reconcileBarrier.resolve();
  await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
});

test("shows save error and keeps input on failed day entry update", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  const retryBarrier = Promise.withResolvers<void>();
  let addRequestCount = 0;
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/add`,
    async (route) => {
      addRequestCount += 1;
      if (addRequestCount === 2) {
        await retryBarrier.promise;
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_SAVE_FAILURE",
            message: "日次入力の保存に失敗しました。",
          },
        }),
      });
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const modal = page.getByTestId("day-entry-modal");
  const amountInput = modal.getByLabel("入力額 (円)");
  const memoInput = modal.getByLabel("メモ");
  const saveButton = modal.getByRole("button", { name: "保存する" });
  await expect(modal).toBeVisible();
  await amountInput.fill("2000");
  await memoInput.fill("失敗後も残るメモ");
  await saveButton.click();

  const saveError = modal.locator("#day-entry-save-error");
  await expect(saveError).toContainText("日次入力の保存に失敗しました。");
  await expect(saveButton).toBeFocused();
  await expect(amountInput).toHaveValue("2000");
  await expect(memoInput).toHaveValue("失敗後も残るメモ");
  expect(
    await saveButton.evaluate(
      (button, error) =>
        error != null &&
        Boolean(
          button.compareDocumentPosition(error) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      await saveError.elementHandle(),
    ),
  ).toBe(true);

  await saveButton.click();
  await expect.poll(() => addRequestCount).toBe(2);
  await expect(saveError).toHaveCount(0);
  await expect(amountInput).toHaveValue("2000");
  await expect(memoInput).toHaveValue("失敗後も残るメモ");
  retryBarrier.resolve();
  await expect(saveError).toContainText("日次入力の保存に失敗しました。");
});

test("shows history load error while keeping the day entry modal usable", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/history`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_HISTORY_FAILURE",
            message: "履歴の取得に失敗しました。",
          },
        }),
      });
    },
  );

  await page.getByTestId(`calendar-day-${todayDate}`).click();

  await expect(page.getByTestId("day-entry-modal")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "履歴の取得に失敗しました。",
  );
  await expect(page.getByRole("button", { name: "保存する" })).toBeEnabled();
});
