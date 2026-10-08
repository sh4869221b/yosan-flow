import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import { waitForResponse } from "./period-operation-state-helpers";
import {
  holdDashboardRead as holdNextSummary,
  resumeDashboard as resume,
} from "./dashboard-resume-helpers";

configureDashboardDayEntryE2E();
test.use({ launchOptions: { args: ["--disable-features=BackForwardCache"] } });

const resumeEvents = ["visibilitychange", "pageshow", "online"] as const;

test.describe("history restoration without back-forward cache", () => {
  // HTTP history cache must stay enabled: request routing would disable it and
  // hide the saved amount reverting to the original server-rendered HTML.
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps a confirmed save visible after leaving and restoring the document", async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
    const response = await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    expect(response?.headers()["cache-control"]).toBe("no-store");
    const history = waitForResponse(
      page,
      `${summaryUrl}/days/${todayDate}/history`,
      "GET",
    );
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: todayDate,
    });
    expect((await history).headers()["cache-control"]).toBe("no-store");
    await modal.getByLabel("入力額 (円)").fill("2000");
    const refreshed = waitForResponse(page, summaryUrl, "GET");
    await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
    expect((await refreshed).headers()["cache-control"]).toBe("no-store");
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");

    const list = await page.goto(`${getBaseUrl()}/api/periods`);
    expect(list?.headers()["cache-control"]).toBe("no-store");
    await page.goBack();
    await waitForDashboardReady(page);
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");
    const persisted = await request.get(summaryUrl);
    expect(persisted.ok()).toBe(true);
    expect((await persisted.json()).dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: todayDate, usedYen: 2000 }),
      ]),
    );
  });
});

for (const event of resumeEvents) {
  test(`refreshes on ${event} while preserving period, day and unsaved drafts`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const selectedDate = addDays(todayDate, 2);
    const nextPeriodId = `${periodId}-next`;
    await seedPeriod(request, getBaseUrl(), {
      periodId: nextPeriodId,
      startDate: addDays(todayDate, 30),
      endDate: addDays(todayDate, 59),
      budgetYen: 90000,
    });
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    await waitForDashboardReady(page);
    await page
      .getByText("期間の終了日や予算を変更する", { exact: true })
      .click();
    await page.getByLabel("期間予算 (円)").fill("130000");
    await page
      .getByTestId("current-period-range-end")
      .fill(addDays(todayDate, 27));
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: selectedDate,
    });
    const amount = modal.getByLabel("入力額 (円)");
    await amount.fill("777");
    await modal.getByLabel("メモ").fill("unsaved draft");
    await amount.focus();
    const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
    expect(
      (
        await request.post(`${summaryUrl}/days/${selectedDate}/add`, {
          data: { inputYen: 2000, memo: "saved while away" },
        })
      ).ok(),
    ).toBe(true);
    await expect(page.getByTestId(`used-${selectedDate}`)).toHaveText("0 円");
    const refreshed = waitForResponse(page, summaryUrl, "GET");
    const historyRefreshed = waitForResponse(
      page,
      `${summaryUrl}/days/${selectedDate}/history`,
      "GET",
    );
    await resume(page, event);
    expect((await refreshed).ok()).toBe(true);
    expect((await historyRefreshed).ok()).toBe(true);
    await expect(page.getByTestId(`used-${selectedDate}`)).toHaveText(
      "2000 円",
    );
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
    await expect(
      page.getByTestId(`calendar-day-${selectedDate}`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(`対象日: ${selectedDate}`);
    const savedHistory = modal.locator("li").filter({
      hasText: "saved while away",
    });
    await expect(savedHistory).toContainText("入力 2000 円");
    await expect(modal.getByText("履歴はまだありません。")).toBeHidden();
    await expect(amount).toHaveValue("777");
    await expect(amount).toBeFocused();
    await expect(modal.getByLabel("メモ")).toHaveValue("unsaved draft");
    await modal.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      addDays(todayDate, 27),
    );
    await expect(page).toHaveURL(`${getBaseUrl()}/?periodId=${periodId}`);
  });
}

test("a delayed resume cannot replace a later confirmed save", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  const barrier = await holdNextSummary(page, summaryUrl);
  try {
    await resume(page, "visibilitychange");
    await barrier.arrived;
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("0 円");
    await modal.getByLabel("入力額 (円)").fill("2000");
    await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");
    barrier.release();
    await barrier.finished;
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");
    await expect(modal).toBeHidden();
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a delayed resume cannot replace a newly selected period", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const nextPeriodId = `${periodId}-next`;
  const nextDate = addDays(todayDate, 30);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  const nextSummaryUrl = `${getBaseUrl()}/api/periods/${nextPeriodId}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId: nextPeriodId,
    startDate: nextDate,
    endDate: addDays(todayDate, 59),
    budgetYen: 90000,
    dailyTotals: [{ date: nextDate, totalUsedYen: 6000 }],
  });
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await waitForDashboardReady(page);
  const barrier = await holdNextSummary(page, summaryUrl);
  try {
    await resume(page, "pageshow");
    await barrier.arrived;
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
    const switched = waitForResponse(page, nextSummaryUrl, "GET");
    await page.getByTestId("period-select").selectOption(nextPeriodId);
    expect((await switched).ok()).toBe(true);
    await expect(page.getByTestId(`used-${nextDate}`)).toHaveText("6000 円");
    barrier.release();
    await barrier.finished;
    await expect(page.getByTestId("period-select")).toHaveValue(nextPeriodId);
    await expect(page.getByTestId(`used-${nextDate}`)).toHaveText("6000 円");
    await expect(page.getByTestId(`calendar-day-${todayDate}`)).toHaveCount(0);
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("retries after reconnecting while an earlier resume request is still failing", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await waitForDashboardReady(page);
  expect(
    (
      await request.post(`${summaryUrl}/days/${todayDate}/add`, {
        data: { inputYen: 2000 },
      })
    ).ok(),
  ).toBe(true);
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let reads = 0;
  await page.route(summaryUrl, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    reads += 1;
    if (reads !== 1) {
      await route.continue();
      return;
    }
    arrived.resolve();
    await release.promise;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "一時的な接続エラー" } }),
    });
  });
  try {
    await resume(page, "visibilitychange");
    await arrived.promise;
    await resume(page, "online");
    expect(reads).toBe(1);
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("0 円");
    const refreshed = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url() === summaryUrl &&
        response.status() === 200,
    );
    release.resolve();
    await refreshed;
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(reads).toBe(2);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});
