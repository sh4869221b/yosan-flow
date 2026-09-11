import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import { seedCurrentPeriod } from "./dashboard-day-entry-helpers";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

test("updates a seeded period budget", async ({ page, request }) => {
  const today = getCurrentJstDate();
  const endDate = addDays(today, 29);
  const periodId = `p-budget-${today}`;

  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate: today,
    endDate,
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByLabel("期間予算 (円)").fill("150000");
  const updateRequest = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      request.url() === `${getBaseUrl()}/api/periods/${periodId}`,
  );
  await page.getByRole("button", { name: "期間を更新" }).click();
  expect((await updateRequest).postDataJSON()).toEqual({
    budgetYen: 150000,
    startDate: today,
    endDate,
  });
  await expect(page.getByTestId("budget-value")).toContainText("150,000");
});

test("rejects malformed period budget values before requests", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  const periodId = `p-${today}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByText("期間の終了日や予算を変更する").click();
  let updateRequestCount = 0;
  await page.route(`**/api/periods/${periodId}`, async (route) => {
    updateRequestCount += 1;
    await route.continue();
  });

  for (const input of ["", "1e3", "1000abc", "10.5", "-1"]) {
    await page.getByLabel("期間予算 (円)").fill(input);
    await page.getByRole("button", { name: "期間を更新" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "予算は 0 以上の整数で入力してください。",
    );
    await expect(page.getByTestId("budget-value")).toContainText("120,000");
  }

  expect(updateRequestCount).toBe(0);
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
