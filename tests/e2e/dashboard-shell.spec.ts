import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

test("shows shell regions in document order", async ({ page, request }) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-shell-current",
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-shell-current`);

  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) <= window.innerWidth,
      ),
    ).toBe(true);
  }

  const order = await page.evaluate(() => {
    const regions = [
      "selected-period-heading",
      "budget-summary-heading",
      "period-calendar-heading",
      "period-settings-heading",
    ].map((id) => document.getElementById(id));
    return regions.slice(1).every((region, index) => {
      const previous = regions[index];
      return (
        previous != null &&
        region != null &&
        Boolean(
          previous.compareDocumentPosition(region) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    });
  });
  expect(order).toBe(true);
  await expect(
    page.getByRole("heading", { name: "次の予算期間を作成する" }),
  ).toHaveCount(0);
});

test("keeps empty and additional create bodies reachable", async ({ page }) => {
  await page.goto(getBaseUrl());
  await expect(page.locator("#empty-period-heading")).toBeVisible();
  await expect(page.getByLabel("期間ID")).toBeVisible();
  await page.getByLabel("期間ID").fill("p-shell-created");
  await page.getByRole("button", { name: "期間を作成" }).click();
  await page.getByText("次の予算期間を作成する").click();
  await expect(
    page.getByTestId("create-period-panel").getByLabel("期間ID"),
  ).toBeVisible();
});

test("keeps the selected summary while a failed selection is reported at the shell", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-shell-current",
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-shell-future",
    startDate: addDays(today, 30),
    endDate: addDays(today, 59),
    budgetYen: 90000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-shell-current`);
  await page.route(`${getBaseUrl()}/api/periods/p-shell-future`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "TEMPORARY_FAILURE", message: "再取得に失敗しました。" },
      }),
    }),
  );
  await page.getByTestId("period-select").selectOption("p-shell-future");
  await expect(page.locator("#page-error-heading")).toBeVisible();
  await expect(page.getByTestId("period-id")).toContainText("p-shell-current");
  await expect(page.getByTestId("period-select")).toBeFocused();

  await page.getByRole("button", { name: "再読み込み" }).click();
  await expect(page.locator("#page-error-heading")).toBeFocused();

  await page.unroute(`${getBaseUrl()}/api/periods/p-shell-future`);
  await page.getByRole("button", { name: "再読み込み" }).click();
  await expect(page.getByTestId("period-id")).toContainText("p-shell-future");
  await expect(page.locator("#selected-period-heading")).toBeFocused();
});

test("keeps the current draft while an exact period GET is loading", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-shell-current",
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-shell-future",
    startDate: addDays(today, 30),
    endDate: addDays(today, 59),
    budgetYen: 90000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-shell-current`);
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByLabel("期間予算 (円)").fill("130000");

  const barrier = Promise.withResolvers<void>();
  let getRequestCount = 0;
  const futureUrl = `${getBaseUrl()}/api/periods/p-shell-future`;
  await page.route(futureUrl, async (route) => {
    expect(route.request().method()).toBe("GET");
    getRequestCount += 1;
    await barrier.promise;
    await route.continue();
  });

  await page.getByTestId("period-select").selectOption("p-shell-future");
  await expect.poll(() => getRequestCount).toBe(1);
  await expect(page.getByTestId("period-select")).toBeDisabled();
  await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
  await expect(page.getByTestId("budget-value")).toContainText("120,000");
  await expect(page.locator(".loading-pill")).toBeVisible();

  barrier.resolve();
  await expect(page.getByTestId("period-id")).toContainText("p-shell-future");
  await expect(page.getByTestId("today-food-allowance")).toContainText("0 円");
  await expect(page.locator("#selected-period-heading")).toBeFocused();
});
