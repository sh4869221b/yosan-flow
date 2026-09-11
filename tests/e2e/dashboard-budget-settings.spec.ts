import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  holdResponse,
  waitForUpdate,
  waitForResponse,
} from "./period-operation-state-helpers";
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
    await expect(field).toBeFocused();
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

  try {
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
  } finally {
    reconcileBarrier.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
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
  await expect(input).toBeFocused();
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
  await expect(
    region.getByRole("heading", { name: "予算設定", exact: true }),
  ).toBeFocused();
  const rangeStart = page.getByTestId("current-period-range-start");
  await rangeStart.fill(addDays(today, 2));
  await expect(rangeStart).toBeFocused();
  await expect(region.getByRole("status")).toHaveText("予算を保存しました。");
  await input.fill("160000");
  await expect(region.getByRole("status")).toHaveCount(0);
});

test("shows accepted budget separately from refresh failure", async ({
  page,
  request,
}) => {
  const { region, input, save } = await openBudget(page, request);
  const requests: string[] = [];
  let requestCount = 0;
  page.on("request", (outgoing) => {
    if (
      outgoing.url() === budgetUrl ||
      outgoing.url() === `${getBaseUrl()}/api/periods`
    )
      requestCount += 1;
  });
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
  await expect(save).toBeFocused();
  await expect(
    region.getByRole("heading", { name: "予算設定", exact: true }),
  ).not.toBeFocused();
  const beforeReset = [...requests];
  const countBeforeReset = requestCount;
  await region.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
  await expect(region.getByRole("status")).toHaveCount(0);
  await expect(input).toHaveValue("150000");
  await expect(input).toBeFocused();
  const rangeEnd = page.getByTestId("current-period-range-end");
  await rangeEnd.fill(addDays(getCurrentJstDate(), 28));
  await expect(rangeEnd).toBeFocused();
  expect(requests).toEqual(beforeReset);
  expect(requestCount).toBe(countBeforeReset);
  expect(requests).toEqual(["PUT", "GET"]);
});

for (const source of ["button", "input", "elsewhere"] as const) {
  test(`restores failed budget submit focus without stealing user focus: ${source}`, async ({
    page,
    request,
  }) => {
    const { region, input, save } = await openBudget(page, request);
    await page.route(budgetUrl, async (route) => {
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
    const updated = waitForUpdate(page, 500, budgetUrl);
    try {
      await input.fill("130000");
      if (source === "input") await input.press("Enter");
      else await save.click();
      await barrier.arrived;
      await expect(region.getByRole("alert")).toHaveText(
        "保存に失敗しました。",
      );
      await expect(input).toHaveValue("130000");
      const outside = page.getByText("期間の終了日や予算を変更する", {
        exact: true,
      });
      if (source === "elsewhere") await outside.focus();
      barrier.release();
      await updated;
      await expect(
        source === "elsewhere" ? outside : source === "input" ? input : save,
      ).toBeFocused();
    } finally {
      barrier.release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("retries a failed budget once while management controls stay disabled", async ({
  page,
  request,
}) => {
  const { region, input, save } = await openBudget(page, request);
  await page.getByText("次の予算期間を作成する", { exact: true }).click();
  const retry = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  let puts = 0;
  await page.route(budgetUrl, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    puts += 1;
    if (puts === 1)
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "保存に失敗しました。" } }),
      });
    else {
      arrived.resolve();
      await retry.promise;
      await route.continue();
    }
  });
  try {
    await input.fill("130000");
    const failed = waitForUpdate(page, 500, budgetUrl);
    await save.click();
    await failed;
    await expect(input).toHaveValue("130000");
    const updated = waitForUpdate(page, 200, budgetUrl);
    await save.dblclick();
    await arrived.promise;
    await expect(
      region.getByRole("button", { name: "保存中...", exact: true }),
    ).toBeDisabled();
    await expect(region.getByRole("form")).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();
    await expect(
      region.getByRole("button", { name: "キャンセル", exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("current-period-range-apply")).toBeDisabled();
    await expect(
      page
        .getByTestId("create-period-panel")
        .getByRole("button", { name: "期間を作成", exact: true }),
    ).toBeDisabled();
    await expect(page.getByTestId("period-select")).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(puts).toBe(2);
    retry.resolve();
    await updated;
    await expect(region.getByText("130,000 円", { exact: true })).toBeVisible();
    await expect(
      region.getByRole("heading", { name: "予算設定", exact: true }),
    ).toBeFocused();
    await expect(region.getByRole("form")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(save).toBeFocused();
    expect(puts).toBe(2);
  } finally {
    retry.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("requires reset after an external budget change", async ({
  page,
  request,
}) => {
  const { today, endDate, region, input, save } = await openBudget(
    page,
    request,
  );
  await input.fill("130000");
  await page.getByTestId("current-period-range-start").fill(addDays(today, 1));
  await page.getByTestId("current-period-range-end").fill(addDays(today, 28));
  expect(
    (
      await request.put(budgetUrl, {
        data: { budgetYen: 140000, startDate: today, endDate },
      })
    ).status(),
  ).toBe(200);
  let puts = 0;
  page.on("request", (outgoing) => {
    if (outgoing.url() === budgetUrl && outgoing.method() === "PUT") puts += 1;
  });
  const day = page.getByTestId(`calendar-day-${today}`);
  await day.click();
  const modal = page.getByTestId("day-entry-modal");
  await modal.getByLabel("入力額 (円)").fill("100");
  const refreshed = waitForResponse(page, budgetUrl, "GET");
  await modal.getByRole("button", { name: "保存する", exact: true }).click();
  expect((await refreshed).status()).toBe(200);
  await expect(modal).toHaveCount(0);
  await expect(day).toBeFocused();
  await expect(region.getByText("140,000 円", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("130000");
  const notice = region.getByText(
    "最新の予算が変更されました。最新の予算に戻してから編集してください。",
  );
  await expect(notice).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    addDays(today, 1),
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    addDays(today, 28),
  );
  await input.fill("140000");
  await expect(save).toBeDisabled();
  await region
    .getByRole("button", { name: "最新の予算に戻す", exact: true })
    .click();
  await expect(input).toHaveValue("140000");
  await expect(notice).toHaveCount(0);
  await expect(input).toBeFocused();
  expect(puts).toBe(0);
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    addDays(today, 1),
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    addDays(today, 28),
  );
  await input.fill("150000");
  await expect(save).toBeEnabled();
  const updated = waitForUpdate(page, 200, budgetUrl);
  await save.click();
  await updated;
  await expect(
    region.getByRole("heading", { name: "予算設定", exact: true }),
  ).toBeFocused();
});

test("discards budget focus when settings close before a delayed result", async ({
  page,
  request,
}) => {
  const { region, input, save } = await openBudget(page, request);
  const barrier = await holdResponse(page, budgetUrl, "PUT");
  try {
    await input.fill("130000");
    const updated = waitForUpdate(page, 200, budgetUrl);
    await save.click();
    await barrier.arrived;
    const disclosure = page.getByText("期間の終了日や予算を変更する", {
      exact: true,
    });
    await disclosure.click();
    barrier.release();
    await updated;
    await expect(disclosure).toBeFocused();
    await expect(region).not.toBeVisible();
    await disclosure.click();
    await expect(disclosure).toBeFocused();
    await expect(region.getByRole("status")).toHaveText("予算を保存しました。");
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 375, height: 812 },
]) {
  test(`budget settings supports desktop and mobile keyboard flow: ${viewport.width}`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const { region, input, save } = await openBudget(page, request);
    const heading = region.getByRole("heading", {
      name: "予算設定",
      exact: true,
    });
    await input.fill("bad");
    await save.click();
    await expect(input).toBeFocused();
    await expect(region.getByRole("alert")).toBeVisible();
    await region.screenshot({
      path: testInfo.outputPath(
        viewport.width === 1440
          ? "budget-settings-desktop.png"
          : "budget-settings-mobile.png",
      ),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await input.fill("130000");
    await heading.focus();
    await page.keyboard.press("Tab");
    await expect(input).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      region.getByRole("button", { name: "キャンセル", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    const updated = waitForUpdate(page, 200, budgetUrl);
    await page.keyboard.press("Enter");
    await updated;
    await expect(heading).toBeFocused();
  });
}
