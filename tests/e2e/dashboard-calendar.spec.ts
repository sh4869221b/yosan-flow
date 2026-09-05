import { expect, test } from "@playwright/test";
import { configureDashboardDayEntryE2E } from "./dashboard-day-entry-helpers";
import { seedPeriod } from "./helpers/db";
import { addDays, getBaseUrl, getCurrentJstDate } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("moves one roving calendar focus across months with keyboard", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-keys",
    startDate: "2026-01-20",
    endDate: "2026-03-10",
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-keys`);

  const januaryEnd = page.getByTestId("calendar-day-2026-01-31");
  const februaryStart = page.getByTestId("calendar-day-2026-02-01");
  await januaryEnd.focus();
  await januaryEnd.press("ArrowRight");

  await expect(februaryStart).toBeFocused();
  await expect(januaryEnd).toHaveAttribute("aria-pressed", "false");
  await expect(februaryStart).toHaveAttribute("tabindex", "0");
  await expect(
    page.locator('[data-testid^="calendar-day-"][tabindex="0"]'),
  ).toHaveCount(1);

  const februaryFourth = page.getByTestId("calendar-day-2026-02-04");
  await februaryFourth.focus();
  await februaryFourth.press("Home");
  await expect(page.getByTestId("calendar-day-2026-02-01")).toBeFocused();
  await page.getByTestId("calendar-day-2026-02-01").press("End");
  await expect(page.getByTestId("calendar-day-2026-02-07")).toBeFocused();

  await februaryFourth.focus();
  await februaryFourth.press("ArrowUp");
  await expect(page.getByTestId("calendar-day-2026-01-28")).toBeFocused();
  await page.getByTestId("calendar-day-2026-01-28").press("ArrowLeft");
  await expect(page.getByTestId("calendar-day-2026-01-27")).toBeFocused();
  await page.getByTestId("calendar-day-2026-02-28").press("PageUp");
  await expect(page.getByTestId("calendar-day-2026-01-28")).toBeFocused();

  await januaryEnd.focus();
  await januaryEnd.press("PageDown");
  await expect(page.getByTestId("calendar-day-2026-02-28")).toBeFocused();

  const rangeStart = page.getByTestId("calendar-day-2026-01-20");
  const rangeEnd = page.getByTestId("calendar-day-2026-03-10");
  await rangeStart.focus();
  await rangeStart.press("ArrowLeft");
  await expect(rangeStart).toBeFocused();
  await rangeEnd.focus();
  await rangeEnd.press("ArrowRight");
  await expect(rangeEnd).toBeFocused();
  await rangeEnd.press("Tab");
  await expect(
    page.locator('[data-testid^="calendar-day-"]:focus'),
  ).toHaveCount(0);
  await page.screenshot({
    path: ".omo/evidence/issue-331-calendar/keyboard.png",
    fullPage: true,
  });
});

test("calendar handoff opens the focused date once with Enter and retains selection after close", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-keys",
    startDate: "2026-01-20",
    endDate: "2026-03-10",
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-keys`);

  const date = "2026-02-01";
  const day = page.getByTestId(`calendar-day-${date}`);
  const historyUrl = `${getBaseUrl()}/api/periods/p-calendar-keys/days/${date}/history`;
  let historyRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url() === historyUrl) {
      historyRequestCount += 1;
    }
  });

  await day.focus();
  await day.press("Enter");
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toContainText(`対象日: ${date}`);
  await expect.poll(() => historyRequestCount).toBe(1);
  await modal.getByRole("button", { name: "閉じる" }).click();

  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(day).toContainText("選択中");
  await page.screenshot({
    path: ".omo/evidence/issue-331-calendar/selected-focused.png",
    fullPage: true,
  });
});

test("calendar handoff opens the focused date once with Space", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-keys",
    startDate: "2026-01-20",
    endDate: "2026-03-10",
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-keys`);

  const date = "2026-02-01";
  const day = page.getByTestId(`calendar-day-${date}`);
  const historyUrl = `${getBaseUrl()}/api/periods/p-calendar-keys/days/${date}/history`;
  let historyRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url() === historyUrl) {
      historyRequestCount += 1;
    }
  });

  await day.focus();
  await day.press("Space");
  await expect(page.getByTestId("day-entry-modal")).toContainText(
    `対象日: ${date}`,
  );
  await expect.poll(() => historyRequestCount).toBe(1);
});

test("keyboard keeps disabled calendar dates focusable without opening history", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-current",
    startDate: "2026-01-20",
    endDate: "2026-03-10",
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-next",
    startDate: "2026-03-11",
    endDate: "2026-04-09",
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-current`);

  const periodSummaryBarrier = Promise.withResolvers<void>();
  const nextSummaryUrl = `${getBaseUrl()}/api/periods/p-calendar-next`;
  let nextSummaryRequestCount = 0;
  await page.route(nextSummaryUrl, async (route) => {
    expect(route.request().method()).toBe("GET");
    nextSummaryRequestCount += 1;
    await periodSummaryBarrier.promise;
    await route.continue();
  });

  await page.getByTestId("period-select").selectOption("p-calendar-next");
  await expect.poll(() => nextSummaryRequestCount).toBe(1);

  const date = "2026-02-01";
  const day = page.getByTestId(`calendar-day-${date}`);
  const historyUrl = `${getBaseUrl()}/api/periods/p-calendar-current/days/${date}/history`;
  let historyRequestCount = 0;
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url() === historyUrl) {
      historyRequestCount += 1;
    }
  });

  await expect(day).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#period-calendar-status")).toContainText(
    "期間を読み込み中です",
  );
  await page.screenshot({
    path: ".omo/evidence/issue-331-calendar/disabled.png",
    fullPage: true,
  });
  await day.focus();
  await expect(day).toBeFocused();
  await day.click({ force: true });
  await day.press("Enter");
  await day.press("Space");
  await expect(page.getByTestId("day-entry-modal")).toBeHidden();
  expect(historyRequestCount).toBe(0);

  periodSummaryBarrier.resolve();
  await expect(page.getByTestId("period-id")).toContainText("p-calendar-next");
});

test("keeps selection separate from keyboard focus and resets it for another period", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  const otherStart = addDays(today, 3);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-current",
    startDate: addDays(today, -2),
    endDate: addDays(today, 2),
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-other",
    startDate: otherStart,
    endDate: addDays(otherStart, 4),
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-current`);

  const todayDay = page.getByTestId(`calendar-day-${today}`);
  const tomorrowDay = page.getByTestId(`calendar-day-${addDays(today, 1)}`);
  await expect(todayDay).toHaveAttribute("tabindex", "0");
  await todayDay.click();
  await page
    .getByTestId("day-entry-modal")
    .getByRole("button", { name: "閉じる" })
    .click();
  await expect(todayDay).toHaveAttribute("aria-pressed", "true");

  await todayDay.focus();
  await todayDay.press("ArrowRight");
  await expect(tomorrowDay).toBeFocused();
  await expect(todayDay).toHaveAttribute("aria-pressed", "true");
  await expect(tomorrowDay).toHaveAttribute("aria-pressed", "false");

  await page.getByTestId("period-select").selectOption("p-calendar-other");
  await expect(page.getByTestId("period-id")).toContainText("p-calendar-other");
  const otherStartDay = page.getByTestId(`calendar-day-${otherStart}`);
  await expect(otherStartDay).toHaveAttribute("aria-pressed", "false");
  await expect(otherStartDay).toHaveAttribute("tabindex", "0");

  await page.getByTestId("period-select").selectOption("p-calendar-current");
  await expect(page.getByTestId("period-id")).toContainText(
    "p-calendar-current",
  );
  await expect(todayDay).toHaveAttribute("aria-pressed", "false");
  await expect(todayDay).toHaveAttribute("tabindex", "0");
});

test("keeps future allowance unchanged while future calendar input remains available", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  const futureStart = addDays(today, 4);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-future",
    startDate: futureStart,
    endDate: addDays(futureStart, 4),
    budgetYen: 90000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-future`);

  const futureDay = page.getByTestId(`calendar-day-${futureStart}`);
  await expect(page.getByTestId("today-food-allowance")).toContainText("0 円");
  await expect(futureDay).toContainText("未来");
  await futureDay.click();
  await expect(page.getByTestId("day-entry-modal")).toContainText(
    `対象日: ${futureStart}`,
  );
});

test("blocks calendar activation while a period save is in flight, then restores it", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-save",
    startDate: addDays(today, -1),
    endDate: addDays(today, 3),
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-save`);

  const saveBarrier = Promise.withResolvers<void>();
  const periodUrl = `${getBaseUrl()}/api/periods/p-calendar-save`;
  let saveRequestCount = 0;
  await page.route(periodUrl, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    saveRequestCount += 1;
    await saveBarrier.promise;
    await route.continue();
  });

  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByLabel("期間予算 (円)").fill("130000");
  await page.getByRole("button", { name: "期間を更新" }).click();
  await expect.poll(() => saveRequestCount).toBe(1);

  const day = page.getByTestId(`calendar-day-${today}`);
  const historyUrl = `${getBaseUrl()}/api/periods/p-calendar-save/days/${today}/history`;
  let historyRequestCount = 0;
  page.on("request", (candidate) => {
    if (candidate.method() === "GET" && candidate.url() === historyUrl) {
      historyRequestCount += 1;
    }
  });
  await expect(day).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#period-calendar-status")).toContainText(
    "期間の操作が完了するまで入力できません",
  );
  await day.click({ force: true });
  await day.press("Enter");
  await day.press("Space");
  await expect(page.getByTestId("day-entry-modal")).toBeHidden();
  expect(historyRequestCount).toBe(0);

  saveBarrier.resolve();
  await expect(day).toHaveAttribute("aria-disabled", "false");
  await day.click();
  await expect(page.getByTestId("day-entry-modal")).toContainText(
    `対象日: ${today}`,
  );
});

test("keeps the calendar inside every supported viewport without clipping state labels", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-calendar-responsive",
    startDate: addDays(today, -2),
    endDate: addDays(today, 2),
    budgetYen: 120000,
    dailyTotals: [
      { date: today, totalUsedYen: 1200 },
      { date: addDays(today, 1), totalUsedYen: 500 },
    ],
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-calendar-responsive`);
  const todayDay = page.getByTestId(`calendar-day-${today}`);
  await todayDay.click();
  await page
    .getByTestId("day-entry-modal")
    .getByRole("button", { name: "閉じる" })
    .click();
  await todayDay.focus();

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
    const bounds = await todayDay.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(56.8);
    expect(bounds?.width).toBeGreaterThan(0);
    await expect(todayDay.getByTestId(`used-${today}`)).toBeVisible();
    await expect(todayDay).toContainText("選択中");
    await page.screenshot({
      path: `.omo/evidence/issue-331-calendar/calendar-${width}.png`,
      fullPage: true,
    });
  }
});
