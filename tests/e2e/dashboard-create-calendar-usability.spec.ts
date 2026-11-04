import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  expectCalendarDayFitsCell,
  expectVisibleCalendarFocus,
} from "./helpers/calendar-appearance";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import { openCreateAdvancedSettings } from "./create-advanced-helpers";

test.beforeEach(async ({ request }) => resetTestData(request));

test("creates with an automatic ID while optional ID settings stay closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(getBaseUrl());
  await waitForDashboardReady(page);
  await expect(page.getByLabel("期間ID", { exact: true })).toBeHidden();
  await page.getByLabel("新規予算額 (円)").fill("50000");
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === `${getBaseUrl()}/api/periods`,
  );
  await page.getByRole("button", { name: "期間を作成", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().id).toBe(`p-${getCurrentJstDate()}`);
  await expect(page.getByTestId("period-select")).toHaveValue(
    `p-${getCurrentJstDate()}`,
  );
});

test("opens optional ID settings to focus an invalid ID on submit", async ({
  page,
}) => {
  await page.goto(getBaseUrl());
  await waitForDashboardReady(page);
  await openCreateAdvancedSettings(page);
  const id = page.getByLabel("期間ID", { exact: true });
  await id.fill("");
  await page.getByText("詳細設定（任意）", { exact: true }).click();
  await expect(id).toBeHidden();
  await page.getByRole("button", { name: "期間を作成", exact: true }).click();
  await expect(id).toBeVisible();
  await expect(id).toBeFocused();
  await expect(id).toHaveAccessibleDescription("期間IDを入力してください。");
});

for (const width of [320, 375, 1280]) {
  test(`returns to today and fits long amounts within calendar cells at ${width}px`, async ({
    page,
    request,
  }) => {
    const today = getCurrentJstDate();
    const periodId = "calendar-usability";
    await seedPeriod(request, getBaseUrl(), {
      periodId,
      startDate: addDays(today, -30),
      endDate: addDays(today, 40),
      budgetYen: 120000,
    });
    const added = await request.post(
      `${getBaseUrl()}/api/periods/${periodId}/days/${today}/add`,
      { data: { inputYen: 12345678, memo: "test" } },
    );
    expect(added.ok()).toBe(true);
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    await waitForDashboardReady(page);
    const lastDay = page.getByTestId(`calendar-day-${addDays(today, 40)}`);
    await lastDay.focus();
    await page.getByRole("button", { name: "今日へ戻る", exact: true }).focus();
    await page
      .getByRole("button", { name: "今日へ戻る", exact: true })
      .press("Enter");
    const todayDay = page.getByTestId(`calendar-day-${today}`);
    await expectVisibleCalendarFocus(todayDay, "rgb(47, 118, 194)");
    await expect(todayDay).toHaveAttribute("tabindex", "0");
    await expect(todayDay).toHaveAttribute("aria-current", "date");
    await expect(page.getByTestId("day-entry-modal")).toHaveCount(0);
    await expectCalendarDayFitsCell(todayDay);
    expect(
      await todayDay.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    if (width < 760) {
      expect(
        await todayDay
          .locator(".used")
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          ),
      ).toBeGreaterThanOrEqual(12);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await todayDay.press("ArrowRight");
    await expect(
      page.getByTestId(`calendar-day-${addDays(today, 1)}`),
    ).toBeFocused();
  });
}

test("hides return to today outside the selected period", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "future",
    startDate: addDays(today, 2),
    endDate: addDays(today, 5),
    budgetYen: 1000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=future`);
  await waitForDashboardReady(page);
  await expect(
    page.getByRole("button", { name: "今日へ戻る", exact: true }),
  ).toHaveCount(0);
});
