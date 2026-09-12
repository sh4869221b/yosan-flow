import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";
import {
  holdResponse,
  waitForResponse,
  waitForUpdate,
} from "./period-operation-state-helpers";

test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

const periodId = "p-range-settings";
const url = `${getBaseUrl()}/api/periods/${periodId}`;
async function openRange(page: Page, request: APIRequestContext) {
  const today = getCurrentJstDate();
  const endDate = addDays(today, 15);
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate: today,
    endDate,
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await page.getByText("期間の終了日や予算を変更する").click();
  const form = page.getByRole("form", { name: "期間設定", exact: true });
  return {
    today,
    endDate,
    form,
    start: form.getByTestId("current-period-range-start"),
    end: form.getByTestId("current-period-range-end"),
    save: form.getByTestId("current-period-range-apply"),
    cancel: form.getByRole("button", { name: "キャンセル", exact: true }),
  };
}

test("shows current and draft range and cancels without writing", async ({
  page,
  request,
}) => {
  const { today, endDate, form, start, end, save, cancel } = await openRange(
    page,
    request,
  );
  const writes: string[] = [];
  page.on("request", (outgoing) => {
    if (["PUT", "POST", "DELETE"].includes(outgoing.method()))
      writes.push(outgoing.url());
  });
  await expect(form).toContainText(`現在の期間 ${today} - ${endDate}`);
  await expect(form).toContainText(periodId);
  await expect(save).toBeDisabled();
  await save.focus();
  await page.keyboard.press("Enter");
  const budget = page.getByLabel("期間予算 (円)");
  await budget.fill("130000");
  const calendar = form.locator("[data-range-calendar-root]");
  await calendar
    .locator(`[data-range-calendar-day][data-value='${addDays(today, 1)}']`)
    .click();
  await expect(start).toHaveValue(addDays(today, 1));
  await expect(end).toHaveValue("");
  await end.fill(addDays(today, 2));
  await expect(form.getByText("未保存の変更があります")).toBeVisible();
  await expect(form).toContainText(`現在の期間 ${today} - ${endDate}`);
  await cancel.click();
  await expect(start).toHaveValue(today);
  await expect(end).toHaveValue(endDate);
  await expect(start).toBeFocused();
  await expect(
    calendar.locator(`[data-range-calendar-day][data-value='${today}']`),
  ).toHaveAttribute("data-selected", "");
  await expect(form.getByText("未保存の変更があります")).toHaveCount(0);
  await expect(budget).toHaveValue("130000");
  expect(writes).toHaveLength(0);
});

test("resets range validation and requires reset after an external range change", async ({
  page,
  request,
}) => {
  const { today, endDate, form, start, end, save, cancel } = await openRange(
    page,
    request,
  );
  let puts = 0;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "PUT") puts += 1;
  });
  await start.fill("bad");
  await start.blur();
  await save.click();
  await expect(start).toBeFocused();
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await cancel.click();
  await expect(form.getByRole("alert")).toHaveCount(0);
  await start.fill("bad");
  await expect(start).toHaveAttribute("aria-invalid", "false");
  await cancel.click();
  await end.fill(addDays(endDate, 1));
  const latestEnd = addDays(endDate, 2);
  expect(
    (
      await request.put(url, {
        data: { budgetYen: 120000, startDate: today, endDate: latestEnd },
      })
    ).status(),
  ).toBe(200);
  await page.getByTestId(`calendar-day-${today}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await modal.getByLabel("入力額 (円)").fill("100");
  const refreshed = waitForResponse(page, url, "GET");
  await modal.getByRole("button", { name: "保存する", exact: true }).click();
  await refreshed;
  await expect(modal).toHaveCount(0);
  await expect(form).toContainText("最新の期間が変更されました。");
  await expect(end).toHaveValue(addDays(endDate, 1));
  await expect(save).toBeDisabled();
  await end.fill(latestEnd);
  await expect(save).toBeDisabled();
  await form
    .getByRole("button", { name: "最新の期間に戻す", exact: true })
    .click();
  await expect(start).toBeFocused();
  await expect(end).toHaveValue(latestEnd);
  await expect(form.getByText(/最新の期間が変更されました/)).toHaveCount(0);
  await end.fill("bad");
  await expect(end).toHaveAttribute("aria-invalid", "false");
  expect(puts).toBe(0);
});

test("saves range with local feedback and retries an ordinary failure", async ({
  page,
  request,
}) => {
  const { today, endDate, form, start, end, save, cancel } = await openRange(
    page,
    request,
  );
  const nextEnd = addDays(endDate, 1);
  const writes: unknown[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url() === url && outgoing.method() === "PUT")
      writes.push(outgoing.postDataJSON());
  });
  await page.route(url, async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    if (writes.length === 1)
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "保存に失敗しました。" } }),
      });
    else await route.fallback();
  });
  await page.getByLabel("期間予算 (円)").fill("130000");
  await end.fill(nextEnd);
  const failed = waitForUpdate(page, 500, url);
  await save.click();
  await failed;
  await expect(form.getByRole("alert")).toHaveText("保存に失敗しました。");
  await expect(save).toHaveAttribute(
    "aria-describedby",
    "range-settings-server-error",
  );
  await expect(end).toHaveValue(nextEnd);
  await expect(save).toBeFocused();
  await expect(form.getByRole("status")).toHaveCount(0);
  const barriers = await Promise.all([
    holdResponse(page, url, "PUT"),
    holdResponse(page, `${getBaseUrl()}/api/periods`, "GET"),
    holdResponse(page, url, "GET"),
  ]);
  try {
    const updated = waitForUpdate(page, 200, url);
    await save.dblclick();
    for (const barrier of barriers) {
      await barrier.arrived;
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(start).toBeDisabled();
      await expect(save).toBeDisabled();
      await expect(cancel).toBeDisabled();
      await page.keyboard.press("Enter");
      expect(writes).toHaveLength(2);
      barrier.release();
    }
    await updated;
    await expect(page.locator("#range-settings-heading")).toBeFocused();
    await expect(form.getByRole("status")).toHaveText("期間を保存しました。");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await expect(form).toHaveAttribute("aria-busy", "false");
    await expect(form).toContainText(`現在の期間 ${today} - ${nextEnd}`);
    await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
    expect(writes).toEqual(
      Array(2).fill({ budgetYen: 120000, startDate: today, endDate: nextEnd }),
    );
    await page.getByLabel("期間予算 (円)").fill("140000");
    await expect(page.getByLabel("期間予算 (円)")).toBeFocused();
    await expect(form.getByRole("status")).toHaveText("期間を保存しました。");
  } finally {
    for (const barrier of barriers) barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("shows accepted range separately from refresh failure", async ({
  page,
  request,
}) => {
  const { today, endDate, form, start, end, save, cancel } = await openRange(
    page,
    request,
  );
  const methods: string[] = [];
  await page.route(url, async (route) => {
    methods.push(route.request().method());
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "再取得に失敗しました。" } }),
      });
    else await route.continue();
  });
  await end.fill(addDays(endDate, 1));
  await save.click();
  await expect(form.getByRole("status")).toHaveText("期間を保存しました。");
  await expect(form.getByRole("alert")).toContainText(
    "期間の保存は完了していますが、最新情報の再取得に失敗しました。",
  );
  await expect(save).toBeFocused();
  await expect(form).toContainText(
    `現在の期間 ${today} - ${addDays(endDate, 1)}`,
  );
  await cancel.click();
  await expect(start).toBeFocused();
  await expect(form.getByRole("status")).toHaveCount(0);
  await expect(form.getByRole("alert")).toHaveCount(0);
  expect(methods).toEqual(["PUT", "GET"]);
});

for (const source of ["input", "elsewhere"] as const) {
  test(`keeps ordinary failure focus: ${source}`, async ({ page, request }) => {
    const { endDate, form, end, save } = await openRange(page, request);
    await page.route(url, async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "保存に失敗しました。" } }),
        });
      else await route.continue();
    });
    const barrier = await holdResponse(
      page,
      `${getBaseUrl()}/api/periods`,
      "GET",
    );
    try {
      await end.fill(addDays(endDate, 1));
      const updated = waitForUpdate(page, 500, url);
      if (source === "input") await end.press("Enter");
      else await save.click();
      await barrier.arrived;
      const disclosure = page.getByText("期間の終了日や予算を変更する", {
        exact: true,
      });
      if (source === "elsewhere") await disclosure.focus();
      barrier.release();
      await updated;
      await expect(source === "input" ? end : disclosure).toBeFocused();
      await expect(form.getByRole("alert")).toHaveText("保存に失敗しました。");
    } finally {
      barrier.release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("does not steal focus after settings close", async ({ page, request }) => {
  const { endDate, form, end, save } = await openRange(page, request);
  const barrier = await holdResponse(page, url, "PUT");
  try {
    await end.fill(addDays(endDate, 1));
    const updated = waitForUpdate(page, 200, url);
    await save.click();
    await barrier.arrived;
    const disclosure = page.getByText("期間の終了日や予算を変更する", {
      exact: true,
    });
    await disclosure.click();
    barrier.release();
    await updated;
    await expect(disclosure).toBeFocused();
    await expect(form).not.toBeVisible();
    await disclosure.click();
    await expect(disclosure).toBeFocused();
    await expect(form.getByRole("status")).toHaveText("期間を保存しました。");
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
]) {
  test(`supports range form keyboard flow on desktop and mobile: ${viewport.width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    const { endDate, form, start, end, save, cancel } = await openRange(
      page,
      request,
    );
    const heading = page.locator("#range-settings-heading");
    await end.fill(addDays(endDate, 1));
    await heading.focus();
    await page.keyboard.press("Tab");
    await expect(start).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(end).toBeFocused();
    const calendar = form.locator("[data-range-calendar-root]");
    await page.keyboard.press("Tab");
    await expect(calendar.locator("button").first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(calendar.locator("button").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      calendar.locator('[data-range-calendar-day][tabindex="0"]'),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(start).toBeFocused();
    await expect(end).toHaveValue(endDate);
    await end.fill(addDays(endDate, 1));
    await form.screenshot({
      path: `test-results/range-settings-${viewport.width === 1280 ? "desktop" : viewport.width === 375 ? "mobile" : "320"}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const updated = waitForUpdate(page, 200, url);
    await end.press("Enter");
    await updated;
    await expect(heading).toBeFocused();
    await expect(form.getByRole("status")).toHaveText("期間を保存しました。");
    expect(runtimeErrors).toEqual([]);
  });
}
