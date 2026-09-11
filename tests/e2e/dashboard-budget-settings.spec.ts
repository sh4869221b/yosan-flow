import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { waitForUpdate } from "./period-operation-state-helpers";
import { seedPeriod } from "./helpers/db";
import { seedCurrentPeriod } from "./dashboard-day-entry-helpers";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

test.describe.configure({ timeout: 120_000 });
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
    const field = page.getByLabel("期間予算 (円)");
    await expect(field).toHaveValue(input);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute(
      "aria-describedby",
      "budget-settings-validation-error",
    );
    await expect(
      page.locator("#budget-settings-validation-error"),
    ).toHaveAttribute("role", "alert");
  }
  await page.getByLabel("期間予算 (円)").fill("130000");
  await expect(page.getByLabel("期間予算 (円)")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.locator("#budget-settings-validation-error")).toHaveCount(
    0,
  );

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

const budgetUrl = `${getBaseUrl()}/api/periods/p-budget-settings`;
async function openBudget(page: Page, request: APIRequestContext) {
  const today = getCurrentJstDate();
  const endDate = addDays(today, 29);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-budget-settings",
    startDate: today,
    endDate,
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-budget-settings`);
  await page.getByText("期間の終了日や予算を変更する").click();
  const region = page.getByRole("region", { name: "予算設定", exact: true });
  return {
    today,
    endDate,
    region,
    input: region.getByLabel("期間予算 (円)"),
    save: region.getByRole("button", { name: "期間を更新", exact: true }),
  };
}

test("shows committed and draft budget and cancels without writing", async ({
  page,
  request,
}) => {
  const { today, endDate, region, input, save } = await openBudget(
    page,
    request,
  );
  const writes: unknown[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url() === budgetUrl && outgoing.method() === "PUT")
      writes.push(outgoing.postDataJSON());
  });
  await expect(region.getByText("120,000 円", { exact: true })).toBeVisible();
  await expect(region).toContainText("p-budget-settings");
  await expect(region).toContainText(`${today} - ${endDate}`);
  await expect(input).toHaveValue("120000");
  await expect(save).toBeDisabled();
  await input.fill("130000");
  await page.getByTestId("current-period-range-start").fill(addDays(today, 1));
  await page.getByTestId("current-period-range-end").fill(addDays(today, 28));
  await expect(region.getByText("120,000 円", { exact: true })).toBeVisible();
  await expect(region.getByText("未保存の変更があります")).toBeVisible();
  await expect(save).toBeEnabled();
  await region.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(input).toHaveValue("120000");
  await expect(region.getByText("未保存の変更があります")).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    addDays(today, 1),
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    addDays(today, 28),
  );
  await input.fill("150000");
  const updated = waitForUpdate(page, 200, budgetUrl);
  await save.click();
  await updated;
  expect(writes).toEqual([{ budgetYen: 150000, startDate: today, endDate }]);
  await expect(region.getByText("150,000 円", { exact: true })).toBeVisible();
  await expect(region.getByText("未保存の変更があります")).toHaveCount(0);
  await expect(save).toBeDisabled();
  await expect(region.getByRole("status")).toHaveText("予算を保存しました。");
});

test("shows accepted budget separately from refresh failure", async ({
  page,
  request,
}) => {
  const { region, input, save } = await openBudget(page, request);
  const requests: string[] = [];
  await page.route(budgetUrl, async (route) => {
    requests.push(route.request().method());
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "再取得に失敗しました。" } }),
      });
    } else await route.continue();
  });
  await input.fill("150000");
  await save.click();
  await expect(input).toBeEnabled();
  await expect(region.getByRole("status")).toHaveText("予算を保存しました。");
  await expect(region.getByRole("alert")).toContainText(
    "予算の保存は完了していますが、最新情報の再取得に失敗しました。",
  );
  await expect(region.getByRole("alert")).toContainText(
    "再取得に失敗しました。",
  );
  await expect(region.getByText("150,000 円", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("150000");
  await expect(save).toBeDisabled();
  const beforeReset = [...requests];
  await region.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  await expect(region.getByRole("status")).toHaveCount(0);
  await expect(input).toHaveValue("150000");
  expect(requests).toEqual(beforeReset);
  expect(requests).toEqual(["PUT", "GET"]);
});
