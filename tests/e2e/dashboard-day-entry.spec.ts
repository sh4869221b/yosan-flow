import { expect, test } from "@playwright/test";
import { seedMonth } from "./helpers/db";
import {
  fetchMonthSummary,
  getBaseUrl,
  getCurrentJstYearMonth,
  monthOffset,
  startDevServer,
  stopDevServer,
  warmUpBrowser
} from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser }, testInfo) => {
  testInfo.setTimeout(120_000);
  await stopDevServer();
  await startDevServer();
  await warmUpBrowser(browser);
});

test.afterEach(async () => {
  await stopDevServer();
});

test("supports add and overwrite, and keeps values after reload", async ({ page, request }) => {
  const yearMonth = getCurrentJstYearMonth();
  const summary = await fetchMonthSummary(request, yearMonth);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();
  await seedMonth(request, getBaseUrl(), {
    yearMonth,
    budgetYen: 120000
  });

  await page.goto(`${getBaseUrl()}/`);
  await expect(page.getByRole("cell", { name: "予定支出" }).first()).toBeVisible();
  await expect(page.getByTestId(`edit-${todayRow?.date}`)).toBeVisible();
  await page.getByTestId(`edit-${todayRow?.date}`).click();
  await expect(page.getByLabel("入力額 (円)")).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("2000");
  await page.getByLabel("追加").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("2000 円");
  await page.getByTestId(`edit-${todayRow?.date}`).click();
  await expect(page.getByLabel("入力額 (円)")).toBeVisible();
  await page.getByLabel("入力額 (円)").fill("500");
  await page.getByLabel("上書き").check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("500 円");

  await page.reload();
  await expect(page.getByTestId(`used-${todayRow?.date}`)).toHaveText("500 円");
});

test("shows save error and keeps input on failed save", async ({ page, request }, testInfo) => {
  const yearMonth = getCurrentJstYearMonth();
  await seedMonth(request, getBaseUrl(), {
    yearMonth,
    budgetYen: 120000
  });
  await page.goto(`${getBaseUrl()}/`);
  await page.getByLabel("月予算 (円)").fill("130000");
  await page.route(`**/api/months/${yearMonth}/budget`, async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "BUDGET_NOT_SET",
          message: "月予算を設定してください。"
        }
      })
    });
  });

  await page.getByRole("button", { name: "予算を保存" }).click();

  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("月予算 (円)")).toHaveValue("130000");
});
