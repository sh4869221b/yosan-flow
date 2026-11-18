import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl, waitForDashboardReady } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("rejects malformed day-entry yen values before requests", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await waitForDashboardReady(page);
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

  for (const input of ["", "1e3", "1000abc", "-1", "9007199254740993"]) {
    await modal.getByLabel("追加する支出額 (円)").fill(input);
    await modal.getByRole("button", { name: "支出を追加" }).click();
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
  const amountInput = modal.getByLabel("追加する支出額 (円)");
  await amountInput.fill("1.5");
  await modal.getByLabel("メモ").fill(memo);
  await modal.getByRole("button", { name: "支出を追加" }).click();

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

test("shows save error and keeps input on failed day entry update", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await waitForDashboardReady(page);
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
  const amountInput = modal.getByLabel("追加する支出額 (円)");
  const memoInput = modal.getByLabel("メモ");
  const saveButton = modal.getByRole("button", { name: "支出を追加" });
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
  await waitForDashboardReady(page);
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
  await expect(
    page
      .getByTestId("day-entry-modal")
      .getByRole("button", { name: "支出を追加", exact: true }),
  ).toBeEnabled();
});

test("reuses the fallback key when a save response is lost", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await waitForDashboardReady(page);

  const keys: string[] = [];
  const addPath = `/api/periods/${periodId}/days/${todayDate}/add`;
  await page.route(`**${addPath}`, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (keys.length === 1) await route.abort("failed");
    else await route.fulfill({ status: 204 });
  });

  const day = page.getByTestId(`calendar-day-${todayDate}`);
  await day.click();
  const modal = page.getByTestId("day-entry-modal");
  const amount = modal.getByLabel("追加する支出額 (円)");
  const save = modal.getByRole("button", { name: "支出を追加" });
  await amount.fill("300");
  await save.click();
  await expect(modal.locator("#day-entry-save-error")).toBeVisible();
  await expect(amount).toHaveValue("300");

  await save.click();
  await expect(modal).toBeHidden();
  await expect(day.getByTestId(`used-${todayDate}`)).toHaveText("300 円");
  expect(keys).toEqual([expect.any(String), keys[0]]);
  expect(keys[0]).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{32}$/);
  const history = await request.get(
    `${getBaseUrl()}/api/periods/${periodId}/days/${todayDate}/history`,
  );
  expect(await history.json()).toMatchObject({
    histories: [{ inputYen: 300 }],
  });
});

for (const recovery of ["button", "online", "add", "edit"] as const) {
  test(`acknowledges a 204 and synchronizes the summary via ${recovery}`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    await waitForDashboardReady(page);
    const summaryPath = `${getBaseUrl()}/api/periods/${periodId}`;
    const recoveryRequiresRead = recovery === "button" || recovery === "online";
    let posts = 0;
    let summaryReads = 0;
    await page.route(`${summaryPath}/days/${todayDate}/add`, async (route) => {
      posts++;
      if (posts > 1) return route.continue();
      expect((await route.fetch()).status()).toBe(200);
      await route.fulfill({ status: 204 });
    });
    await page.route(summaryPath, async (route) => {
      summaryReads++;
      if (summaryReads === 1 || !recoveryRequiresRead)
        await route.fulfill({ status: 503 });
      else await route.continue();
    });

    const day = page.getByTestId(`calendar-day-${todayDate}`);
    await day.click();
    const modal = page.getByTestId("day-entry-modal");
    await modal.getByLabel("追加する支出額 (円)").fill("300");
    const failedSummary = page.waitForResponse(
      (response) =>
        response.url() === summaryPath &&
        response.status() === 503 &&
        response.request().method() === "GET",
    );
    await modal.getByRole("button", { name: "支出を追加" }).click();
    await failedSummary;
    await expect(modal).toBeHidden();
    await expect(page.getByTestId("day-entry-save-status")).toContainText(
      "支出を保存しました",
    );
    const warning = page.getByTestId("day-entry-summary-unsynced");
    await expect(warning).toContainText("表示中の集計はまだ更新されていません");
    const used = day.getByTestId(`used-${todayDate}`);
    await expect(used).toHaveText("0 円");

    if (recovery === "online") {
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    } else if (recovery === "button") {
      await page.getByRole("button", { name: "集計を再取得" }).click();
    } else {
      await day.click();
      if (recovery === "add") {
        await modal.getByLabel("追加する支出額 (円)").fill("200");
        await modal.getByRole("button", { name: "支出を追加" }).click();
      } else {
        await modal.getByRole("button", { name: "編集" }).click();
        const editingRow = modal.locator("li.editing");
        await editingRow.getByLabel("入力額 (円)").fill("500");
        await editingRow
          .getByRole("button", { name: "保存", exact: true })
          .click();
      }
    }
    await expect(used).toHaveText(recoveryRequiresRead ? "300 円" : "500 円");
    await expect(warning).toHaveCount(0);
    expect(posts).toBe(recovery === "add" ? 2 : 1);
    if (recoveryRequiresRead) expect(summaryReads).toBe(2);
  });
}
