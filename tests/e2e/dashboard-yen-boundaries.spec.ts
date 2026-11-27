import { expect, test } from "@playwright/test";
import { createTestHarness } from "wrangler";
import { configureDashboardDayEntryE2E } from "./dashboard-day-entry-helpers";
import { getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import { holdResponse } from "./period-operation-state-helpers";

configureDashboardDayEntryE2E();

test("marks overflow in the day and period forecasts and restores the exact boundary", async ({
  page,
  request,
}) => {
  const periodId = "preview-cap";
  const first = "2028-11-01";
  const second = "2028-11-02";
  const max = Number.MAX_SAFE_INTEGER;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate: first,
    endDate: second,
    budgetYen: max,
    dailyTotals: [{ date: first, totalUsedYen: max }],
  });
  await page.goto(getBaseUrl() + "/");
  await waitForDashboardReady(page);

  for (const [date, error] of [
    [first, "日計が扱える金額の上限を超えます。"],
    [second, "期間合計が扱える金額の上限を超えます。"],
  ]) {
    await page.getByTestId(`calendar-day-${date}`).click();
    const modal = page.getByTestId("day-entry-modal");
    await expect(modal).toContainText(`対象日: ${date}`);
    const input = modal.getByLabel("追加する支出額 (円)");
    const save = modal.getByRole("button", { name: "支出を追加" });
    await input.fill("2");
    await expect(modal.getByRole("alert")).toHaveText(error);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(modal.getByText("—", { exact: true })).toBeVisible();
    await expect(modal.getByText(/9,007,199,254,740,992/)).toHaveCount(0);
    await expect(save).toBeDisabled();
    await input.press("Enter");
    await expect(modal).toBeVisible();

    await input.fill("0");
    await expect(modal.getByRole("alert")).toHaveCount(0);
    await expect(save).toBeEnabled();
    await expect(
      modal.getByText(
        date === first
          ? /今回の追加 0 円 ＝ 日計 9,007,199,254,740,991 円$/
          : /今回の追加 0 円 ＝ 日計 0 円$/,
      ),
    ).toBeVisible();
    await modal.getByRole("button", { name: "閉じる" }).click();
    await expect(modal).toBeHidden();
  }
});

for (const unavailable of [true, false]) {
  test(`a budget save queued behind a history edit handles a ${unavailable ? "missing" : "normal"} summary`, async ({
    page,
    request,
  }) => {
    // A separate local runtime supplies rows that the current public API cannot
    // create. The normal Playwright database is isolated from this fixture.
    const harness = createTestHarness({
      workers: [{ configPath: ".svelte-kit/cloudflare/worker/wrangler.json" }],
    });
    try {
      const { url } = await harness.listen();
      const app = harness.getWorker<{ DB: D1Database }>();
      await app.applyD1Migrations("DB");
      const healthy = "healthy-period";
      const legacy = "legacy-over-limit";
      for (const [periodId, month] of [
        [healthy, "01"],
        [legacy, "02"],
      ]) {
        await seedPeriod(request, url.origin, {
          periodId,
          startDate: `2028-${month}-01`,
          endDate: `2028-${month}-02`,
          budgetYen: 500,
          dailyTotals:
            periodId === legacy
              ? [{ date: "2028-02-01", totalUsedYen: 100 }]
              : [],
        });
      }
      const opened = await page.goto(url.href);
      expect(opened?.status()).toBe(200);
      await waitForDashboardReady(page);
      const select = page.getByTestId("period-select");
      await expect(select).toHaveValue(legacy);
      const periodUrl = new URL(`/api/periods/${legacy}`, url).href;
      const historyUrl = `${periodUrl}/days/2028-02-01/history`;
      const { histories } = await (await request.get(historyUrl)).json();
      expect(histories).toHaveLength(1);
      const patch = await holdResponse(
        page,
        `${historyUrl}/${histories[0].id}`,
        "PATCH",
      );
      const put = await holdResponse(page, periodUrl, "PUT");
      const putSent: string[] = [];
      page.on("request", (req) => {
        if (req.method() === "PUT" && req.url() === periodUrl)
          putSent.push(req.url());
      });
      const day = page.getByTestId("calendar-day-2028-02-01");
      await day.click();
      const modal = page.getByTestId("day-entry-modal");
      await modal.getByRole("button", { name: "編集" }).click();
      await modal.getByLabel("入力額 (円)").fill("111");
      await modal.getByRole("button", { name: "保存", exact: true }).click();
      expect((await patch.arrived).status()).toBe(200);
      await modal.getByRole("button", { name: "閉じる" }).click();
      await expect(modal).toBeHidden();
      await page.getByText("期間の日付や予算を変更する").click();
      await page.getByLabel("期間予算 (円)").fill("777");
      await page.getByRole("button", { name: "予算を保存" }).click();
      await expect(
        page.getByRole("button", { name: "保存中..." }),
      ).toBeDisabled();
      expect(putSent).toHaveLength(0);

      const { DB: db } = await app.getEnv();
      if (unavailable)
        await db
          .prepare(
            `
      INSERT INTO daily_totals (budget_period_id, date, year_month, total_used_yen, updated_at)
      VALUES (?, '2028-02-02', '2028-02', ?, '2028-02-02T00:00:00Z')
    `,
          )
          .bind(legacy, Number.MAX_SAFE_INTEGER)
          .run();

      patch.release();
      const saved = await put.arrived;
      try {
        expect(saved.status()).toBe(200);
        expect(await saved.json()).toMatchObject(
          unavailable
            ? { period: { budgetYen: 777 }, summary: null }
            : { budgetYen: 777 },
        );
        await expect(day.getByTestId("used-2028-02-01")).toHaveText("111 円");
        await expect(page.getByTestId("budget-value")).toContainText("500");
      } finally {
        put.release();
      }
      expect(
        await db
          .prepare("SELECT budget_yen FROM budget_periods WHERE id = ?")
          .bind(legacy)
          .first("budget_yen"),
      ).toBe(777);
      if (!unavailable) {
        await expect(page.getByTestId("budget-value")).toContainText("777");
        await expect(day.getByTestId("used-2028-02-01")).toHaveText("111 円");
        await expect(page.getByRole("alert")).toHaveCount(0);
        return;
      }
      await expect(page.getByRole("alert")).toContainText(
        "期間の設定は保存済みです。",
      );
      await expect(page.getByTestId("budget-value")).toHaveCount(0);

      const reloaded = await page.reload();
      expect(reloaded?.status()).toBe(200);
      await waitForDashboardReady(page);
      await expect(page.getByRole("alert")).toContainText(
        "集計を表示できません。",
      );
      await expect(select).toHaveValue(legacy);
      await expect(select.locator("option")).toHaveCount(2);
      await select.selectOption(healthy);
      await expect(page.getByTestId("period-id")).toContainText(healthy);
      await expect(page.getByTestId("budget-value")).toContainText("500");
      await expect(page.getByRole("alert")).toHaveCount(0);
    } finally {
      await harness.close();
    }
  });
}
