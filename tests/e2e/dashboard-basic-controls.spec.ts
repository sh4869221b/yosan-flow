import { expect, test, type Locator } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import { holdDashboardRead, resumeDashboard } from "./dashboard-resume-helpers";
import { seedPeriod } from "./helpers/db";
import { waitForResponse } from "./period-operation-state-helpers";

configureDashboardDayEntryE2E();

test("switches the labelled native period select with the keyboard", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const nextPeriodId = `${periodId}-next`;
  await seedPeriod(request, getBaseUrl(), {
    periodId: nextPeriodId,
    startDate: addDays(todayDate, 30),
    endDate: addDays(todayDate, 59),
    budgetYen: 120_000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await waitForDashboardReady(page);

  const select = page.getByRole("combobox", { name: "期間を切り替え" });
  await expect(select).toHaveValue(periodId);
  expect(
    await select.evaluate((element) => element instanceof HTMLSelectElement),
  ).toBe(true);
  await page.getByText("期間を切り替え", { exact: true }).click();
  await expect(select).toBeFocused();
  const key = await select.evaluate((element, targetId) => {
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error("Period selection must use a native select");
    }
    const targetIndex = Array.from(element.options).findIndex(
      (option) => option.value === targetId,
    );
    if (
      targetIndex < 0 ||
      Math.abs(targetIndex - element.selectedIndex) !== 1
    ) {
      throw new Error("The seeded periods must be adjacent native options");
    }
    return targetIndex < element.selectedIndex ? "ArrowUp" : "ArrowDown";
  }, nextPeriodId);

  const summaryUrl = new URL(
    `/api/periods/${encodeURIComponent(nextPeriodId)}`,
    getBaseUrl(),
  ).href;
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await page.route(summaryUrl, async (route) => {
    if (
      route.request().method() !== "GET" ||
      route.request().url() !== summaryUrl
    ) {
      await route.continue();
      return;
    }
    requested.resolve();
    await release.promise;
    await route.continue();
  });

  try {
    await select.press(key);
    await requested.promise;
    await expect(select).toBeDisabled();
    await expect(
      page.getByText("読み込み中...", { exact: true }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "GET" &&
        candidate.url() === summaryUrl,
    );
    release.resolve();
    expect((await response).ok()).toBe(true);
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue(nextPeriodId);
    await expect(page.getByTestId("period-id")).toContainText(nextPeriodId);
    await expect(page.locator("#selected-period-heading")).toBeFocused();
  } finally {
    release.resolve();
  }
});

test("keeps a restored period selected when resume adds an option after a failed switch", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const nextPeriodId = `${periodId}-next`;
  const addedPeriodId = `${periodId}-added`;
  await seedPeriod(request, getBaseUrl(), {
    periodId: nextPeriodId,
    startDate: addDays(todayDate, 30),
    endDate: addDays(todayDate, 59),
    budgetYen: 90_000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await waitForDashboardReady(page);

  const select = page.getByRole("combobox", { name: "期間を切り替え" });
  const currentSummaryUrl = new URL(
    `/api/periods/${encodeURIComponent(periodId)}`,
    getBaseUrl(),
  ).href;
  const nextSummaryUrl = new URL(
    `/api/periods/${encodeURIComponent(nextPeriodId)}`,
    getBaseUrl(),
  ).href;
  const listUrl = new URL("/api/periods", getBaseUrl()).href;
  const switchRequested = Promise.withResolvers<void>();
  const releaseSwitch = Promise.withResolvers<void>();
  let nextSummaryReads = 0;
  await page.route(nextSummaryUrl, async (route) => {
    if (
      route.request().method() !== "GET" ||
      route.request().url() !== nextSummaryUrl
    ) {
      await route.continue();
      return;
    }
    nextSummaryReads += 1;
    if (nextSummaryReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_FAILURE",
            message: "再取得に失敗しました。",
          },
        }),
      });
      return;
    }
    switchRequested.resolve();
    await releaseSwitch.promise;
    await route.continue();
  });
  const resumeRead = await holdDashboardRead(page, currentSummaryUrl);

  try {
    const failed = waitForResponse(page, nextSummaryUrl, "GET");
    await select.selectOption(nextPeriodId);
    expect((await failed).status()).toBe(503);
    await expect(page.locator("#page-error-heading")).toBeVisible();
    await expect(select).toHaveValue(periodId);
    await expect(select).toBeFocused();
    await expect(page.getByTestId("period-id")).toHaveText(
      `${periodId} / 30 日`,
    );
    expect(nextSummaryReads).toBe(1);

    await seedPeriod(request, getBaseUrl(), {
      periodId: addedPeriodId,
      startDate: addDays(todayDate, 60),
      endDate: addDays(todayDate, 89),
      budgetYen: 70_000,
    });
    await expect(select.locator("option")).toHaveCount(2);
    const listRefreshed = waitForResponse(page, listUrl, "GET");
    await resumeDashboard(page);
    expect((await listRefreshed).ok()).toBe(true);
    await resumeRead.arrived;

    // The option list has changed while the retained period's summary is held.
    await expect(select.locator("option")).toHaveCount(3);
    await expect(
      select.locator(`option[value="${addedPeriodId}"]`),
    ).toHaveCount(1);
    await expect(select).toHaveValue(periodId);
    await expect(page.getByTestId("period-id")).toHaveText(
      `${periodId} / 30 日`,
    );
    await expect(page.getByTestId("budget-value")).toContainText("120,000");
    expect(nextSummaryReads).toBe(1);

    resumeRead.release();
    await resumeRead.finished;
    await expect(select).toHaveValue(periodId);
    await expect(page.getByTestId("period-id")).toHaveText(
      `${periodId} / 30 日`,
    );
    await expect(page.locator("#page-error-heading")).toBeHidden();

    const switched = waitForResponse(page, nextSummaryUrl, "GET");
    await select.selectOption(nextPeriodId);
    await switchRequested.promise;
    await expect(select).toBeDisabled();
    await expect(page.getByTestId("period-id")).toHaveText(
      `${periodId} / 30 日`,
    );
    expect(nextSummaryReads).toBe(2);
    releaseSwitch.resolve();
    expect((await switched).ok()).toBe(true);
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue(nextPeriodId);
    await expect(page.getByTestId("period-id")).toHaveText(
      `${nextPeriodId} / 30 日`,
    );
    await expect(page.getByTestId("budget-value")).toContainText("90,000");
    await expect(page.locator("#selected-period-heading")).toBeFocused();
    expect(nextSummaryReads).toBe(2);
  } finally {
    resumeRead.release();
    releaseSwitch.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

async function expectUnclippedMoneyFocus(amount: Locator): Promise<void> {
  await expect(amount).toBeFocused();
  await expect
    .poll(() =>
      amount.evaluate((element) => {
        const group = element.closest<HTMLElement>(".money-input");
        const form = element.closest("form");
        if (!group || !form)
          throw new Error("Amount must belong to a money group and form");
        const groupBounds = group.getBoundingClientRect();
        const formBounds = form.getBoundingClientRect();
        const inputBounds = element.getBoundingClientRect();
        const fits = (inner: DOMRect, outer: DOMRect, expansion = 0) =>
          Math.max(
            outer.left - inner.left + expansion,
            inner.right - outer.right + expansion,
            outer.top - inner.top + expansion,
            inner.bottom - outer.bottom + expansion,
          ) <= 1;
        // An input outline must fit its clipping wrapper. A wrapper outline must
        // fit the form, so either focus treatment remains fully visible.
        const visibleOutline = [element, group].some((candidate) => {
          const style = getComputedStyle(candidate);
          const width = Number.parseFloat(style.outlineWidth);
          const expansion = Math.max(
            0,
            width + Number.parseFloat(style.outlineOffset),
          );
          return (
            width > 0 &&
            style.outlineStyle !== "none" &&
            style.outlineColor !== "transparent" &&
            style.outlineColor !== "rgba(0, 0, 0, 0)" &&
            fits(
              candidate.getBoundingClientRect(),
              candidate === element ? groupBounds : formBounds,
              expansion,
            )
          );
        });
        return {
          inputFits: fits(inputBounds, groupBounds),
          groupFits: fits(groupBounds, formBounds),
          pageFits: document.documentElement.scrollWidth <= innerWidth,
          visibleOutline,
        };
      }),
    )
    .toEqual({
      inputFits: true,
      groupFits: true,
      pageFits: true,
      visibleOutline: true,
    });
}

for (const width of [320, 1280]) {
  test(`keeps the amount focus indicator visible inside the ${width}px form`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    await page.goto(
      `${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`,
    );
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: todayDate,
    });
    const amount = modal.getByRole("textbox", {
      name: "入力額 (円)",
      exact: true,
    });
    const memo = modal.getByRole("textbox", { name: "メモ", exact: true });

    await expect(
      modal.getByRole("heading", { name: `日次入力 対象日: ${todayDate}` }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expectUnclippedMoneyFocus(amount);
    await amount.fill("1.5");
    await amount.press("Enter");
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expectUnclippedMoneyFocus(amount);
    await expect(amount).toHaveAccessibleDescription(
      "入力額は 0 以上の整数で入力してください。",
    );

    await amount.fill("1200");
    await expect(amount).toHaveAttribute("aria-invalid", "false");
    await page.keyboard.press("Tab");
    await expect(memo).toBeFocused();
    await memo.pressSequentially("lunch");
    await memo.press("Enter");
    await memo.pressSequentially("groceries");
    await expect(memo).toHaveValue("lunch\ngroceries");
    await expect(modal).toBeVisible();
    await memo.press("Escape");
    await expect(modal).toBeHidden();
    await expect(page.getByTestId(`calendar-day-${todayDate}`)).toBeFocused();
  });
}
