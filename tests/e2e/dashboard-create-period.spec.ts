import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
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

for (const failureStage of ["summary", "list"] as const) {
  test(`initial create recovers after ${failureStage} failure with GET only`, async ({
    page,
  }) => {
    const periodId = `p-${getCurrentJstDate()}`;
    const failedUrl = `${getBaseUrl()}/api/periods${failureStage === "summary" ? `/${periodId}` : ""}`;
    const retryStarted = Promise.withResolvers<void>();
    const releaseRetry = Promise.withResolvers<void>();
    let posts = 0;
    let gets = 0;
    await page.goto(getBaseUrl());
    page.on("request", (request) => {
      if (request.method() === "POST") posts += 1;
    });
    await page.route(failedUrl, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      gets += 1;
      if (gets > 2) return route.continue();
      if (gets === 2) {
        retryStarted.resolve();
        await releaseRetry.promise;
      }
      await route.fulfill({
        status: 503,
        json: { error: { message: "表示の取得に失敗しました。" } },
      });
    });
    await page.getByRole("button", { name: "期間を作成", exact: true }).click();
    const status = page.getByRole("heading", {
      name: `期間は作成済みです: ${periodId}`,
      exact: true,
    });
    const retry = page.getByRole("button", {
      name: "表示を再読み込み",
      exact: true,
    });
    await expect(status).toBeFocused();
    await expect(status).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "最初の予算期間を作成" }),
    ).toBeVisible();
    await expect(page.getByLabel("期間ID", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    const retryElement = await retry.elementHandle();
    try {
      await retry.press("Enter");
      await retryStarted.promise;
      await expect(retry).toHaveAttribute("aria-disabled", "true");
      expect(
        await retryElement?.evaluate(
          (element) => element === document.activeElement,
        ),
      ).toBe(true);
      await retry.press("Enter");
      expect(gets).toBe(2);
    } finally {
      releaseRetry.resolve();
    }
    await expect(status).toBeFocused();
    await page.keyboard.press("Tab");
    await retry.press("Enter");
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
    await expect(page.locator("#selected-period-heading")).toBeFocused();
    expect(posts).toBe(1);
    expect(gets).toBe(3);
  });
}

for (const variant of ["initial", "additional"] as const) {
  test(`${variant} create submits edits made after range apply`, async ({
    page,
    request,
  }) => {
    const today = getCurrentJstDate();
    if (variant === "additional") {
      await seedPeriod(request, getBaseUrl(), {
        periodId: "p-existing",
        startDate: today,
        endDate: addDays(today, 29),
        budgetYen: 120000,
      });
    }
    await page.goto(getBaseUrl());
    if (variant === "additional") {
      await page.getByText("次の予算期間を作成する").click();
    }
    const prefix = variant === "initial" ? "initial-period" : "create-period";
    expect(
      await page
        .getByTestId("create-period-panel")
        .locator("input")
        .evaluateAll((inputs) => inputs.map((input) => input.id)),
    ).toEqual([
      `${prefix}-range-start`,
      `${prefix}-range-end`,
      `${prefix}-budget`,
      `${prefix}-id`,
    ]);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT"].includes(request.method()))
        writes.push(request.url());
    });
    await page.getByLabel("期間ID", { exact: true }).fill("p-current-draft");
    await page.getByTestId(`${prefix}-range-start`).fill(addDays(today, 30));
    await page.getByTestId(`${prefix}-range-end`).fill(addDays(today, 59));
    await page.getByTestId(`${prefix}-range-apply`).click();
    await page.getByTestId(`${prefix}-range-end`).fill(addDays(today, 60));
    await expect(page.getByLabel("期間ID", { exact: true })).toHaveValue(
      "p-current-draft",
    );
    expect(writes).toEqual([]);

    const posted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url() === `${getBaseUrl()}/api/periods`,
    );
    await page.getByRole("button", { name: "期間を作成", exact: true }).click();
    expect((await posted).postDataJSON()).toMatchObject({
      id: "p-current-draft",
      startDate: addDays(today, 30),
      endDate: addDays(today, 60),
      budgetYen: 120000,
    });
    await expect(page.getByTestId("period-id")).toContainText(
      "p-current-draft",
    );
    expect(writes).toEqual([`${getBaseUrl()}/api/periods`]);
  });
}

test("guards duplicate creation through a held POST and list GET", async ({
  page,
}) => {
  const postStarted = Promise.withResolvers<void>();
  const listStarted = Promise.withResolvers<void>();
  const releasePost = Promise.withResolvers<void>();
  const releaseList = Promise.withResolvers<void>();
  let posts = 0;
  let gets = 0;
  await page.goto(getBaseUrl());
  await page.route(`${getBaseUrl()}/api/periods`, async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      const response = await route.fetch();
      postStarted.resolve();
      await releasePost.promise;
      return route.fulfill({ response });
    }
    gets += 1;
    listStarted.resolve();
    await releaseList.promise;
    await route.continue();
  });
  const submit = page.locator('button[type="submit"]');
  try {
    await submit.click();
    await postStarted.promise;
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(page.getByLabel("期間ID", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "取り消す", exact: true }),
    ).toBeDisabled();
    await submit.press("Enter");
    await submit.press("Enter");
    expect(posts).toBe(1);
    releasePost.resolve();
    await listStarted.promise;
    const retry = page.getByRole("button", {
      name: "表示を再読み込み",
      exact: true,
    });
    await expect(retry).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByRole("heading", { name: "最初の予算期間を作成" }),
    ).toBeVisible();
    await retry.press("Enter");
    await retry.press("Enter");
    expect(posts).toBe(1);
    expect(gets).toBe(1);
  } finally {
    releasePost.resolve();
    releaseList.resolve();
  }
  await expect(page.locator("#selected-period-heading")).toBeFocused();
  expect(posts).toBe(1);
  expect(gets).toBe(1);
});

test("additional recovery does not reopen or steal focus after closing during retry", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  const periodId = "p-additional-recovery";
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-existing",
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });
  const retryStarted = Promise.withResolvers<void>();
  const releaseRetry = Promise.withResolvers<void>();
  let gets = 0;
  let posts = 0;
  await page.goto(getBaseUrl());
  page.on("request", (request) => {
    if (request.method() === "POST") posts += 1;
  });
  await page.route(`${getBaseUrl()}/api/periods/${periodId}`, async (route) => {
    gets += 1;
    if (gets === 1) {
      return route.fulfill({
        status: 503,
        json: { error: { message: "表示の取得に失敗しました。" } },
      });
    }
    retryStarted.resolve();
    await releaseRetry.promise;
    await route.continue();
  });
  const details = page.getByTestId("create-period-panel");
  const opener = details.locator("summary");
  await opener.click();
  await page.getByLabel("期間ID", { exact: true }).fill(periodId);
  await page.getByRole("button", { name: "期間を作成", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `期間は作成済みです: ${periodId}`,
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.getByTestId("period-select")).toHaveValue("p-existing");
  await expect(page.getByTestId("period-select")).toBeEnabled();
  const retry = page.getByRole("button", {
    name: "表示を再読み込み",
    exact: true,
  });
  try {
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await retry.press("Enter");
    await retryStarted.promise;
    await opener.click();
    await expect(details).not.toHaveAttribute("open", "");
  } finally {
    releaseRetry.resolve();
  }
  await expect(page.getByTestId("period-select")).toHaveValue(periodId);
  await expect(details).not.toHaveAttribute("open", "");
  await expect(opener).toBeFocused();
  expect(posts).toBe(1);
  expect(gets).toBe(2);
  await page.getByTestId("period-select").selectOption("p-existing");
  await expect(page.locator("#selected-period-heading")).toBeFocused();
  await expect(page.getByTestId("period-select")).toHaveValue("p-existing");
  await expect(details).not.toHaveAttribute("open", "");
});

test("validates fields in form order and submits corrected drafts with Enter", async ({
  page,
}) => {
  const today = getCurrentJstDate();
  const writes: string[] = [];
  await page.goto(getBaseUrl());
  page.on("request", (request) => {
    if (["POST", "PUT"].includes(request.method())) writes.push(request.url());
  });
  const start = page.getByTestId("initial-period-range-start");
  const end = page.getByTestId("initial-period-range-end");
  const budget = page.getByLabel("新規予算額 (円)");
  const id = page.getByLabel("期間ID", { exact: true });
  const submit = page.getByRole("button", { name: "期間を作成", exact: true });
  await start.fill("2026-09-");
  await end.fill("");
  await budget.fill("10.5");
  await id.fill("   ");
  await submit.click();
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("2026-09-");
  await expect(start).toHaveAccessibleDescription(/有効な開始日/);
  await expect(end).toHaveAccessibleDescription(/有効な終了日/);
  await expect(budget).toHaveAccessibleDescription(
    "予算は 0 以上の整数で入力してください。",
  );
  await expect(id).toHaveAccessibleDescription("期間IDを入力してください。");
  await expect(budget).toHaveAttribute("aria-invalid", "true");
  await expect(id).toHaveAttribute("aria-invalid", "true");
  await start.fill(today);
  await submit.click();
  await expect(end).toBeFocused();
  await end.fill(addDays(today, 29));
  await submit.click();
  await expect(budget).toBeFocused();
  await budget.fill("130000");
  await expect(budget).toHaveAttribute("aria-invalid", "false");
  await submit.click();
  await expect(id).toBeFocused();
  expect(writes).toEqual([]);
  await id.fill("p-enter-create");
  await expect(id).toHaveAttribute("aria-invalid", "false");
  await id.press("Enter");
  await expect(page.getByTestId("period-id")).toContainText("p-enter-create");
  expect(writes).toEqual([`${getBaseUrl()}/api/periods`]);
});

test("initial cancel restores defaults and clears field errors without writing", async ({
  page,
}, testInfo) => {
  const today = getCurrentJstDate();
  await page.goto(getBaseUrl());
  const writes: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT"].includes(request.method())) writes.push(request.url());
  });
  const start = page.getByTestId("initial-period-range-start");
  const end = page.getByTestId("initial-period-range-end");
  await page.getByLabel("期間ID", { exact: true }).fill("p-custom");
  await start.fill(addDays(today, 2));
  await end.fill(addDays(today, 1));
  await page.getByTestId("initial-period-range-apply").click();
  await expect(start).toBeFocused();
  await expect(start).toHaveAccessibleDescription(/終了日は開始日以降/);
  await page.getByLabel("新規予算額 (円)").fill("bad");
  await page.getByRole("button", { name: "期間を作成", exact: true }).click();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(start).toBeFocused();
  await expect(start).toHaveValue(today);
  await expect(end).toHaveValue(addDays(today, 29));
  await expect(page.getByLabel("期間ID", { exact: true })).toHaveValue(
    `p-${today}`,
  );
  await expect(page.getByLabel("新規予算額 (円)")).toHaveValue("120000");
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await start.fill(addDays(today, 1));
  await expect(page.getByLabel("期間ID", { exact: true })).toHaveValue(
    `p-${addDays(today, 1)}`,
  );
  expect(writes).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("create-reset.png"),
    fullPage: true,
  });
});

test("additional cancel closes the form and keeps drafts while clearing server feedback", async ({
  page,
  request,
}) => {
  const today = getCurrentJstDate();
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-existing",
    startDate: today,
    endDate: addDays(today, 29),
    budgetYen: 120000,
  });
  await page.goto(getBaseUrl());
  const opener = page.getByText("次の予算期間を作成する");
  await opener.click();
  await page.getByLabel("期間ID", { exact: true }).fill("p-retained");
  await page.getByLabel("新規予算額 (円)").fill("130000");
  let writes = 0;
  await page.route("**/api/periods", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes += 1;
    await route.fulfill({
      status: 503,
      json: { error: { message: "作成失敗" } },
    });
  });
  await page.getByRole("button", { name: "期間を作成", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("作成失敗");
  await expect(
    page.getByRole("button", { name: "期間を作成", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(opener).toBeFocused();
  await expect(page.getByLabel("期間ID", { exact: true })).not.toBeVisible();
  await opener.click();
  await expect(page.getByLabel("期間ID", { exact: true })).toHaveValue(
    "p-retained",
  );
  await expect(page.getByLabel("新規予算額 (円)")).toHaveValue("130000");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByTestId("create-period-range-start").fill(addDays(today, 31));
  await expect(page.getByLabel("期間ID", { exact: true })).toHaveValue(
    "p-retained",
  );
  expect(writes).toBe(1);
});
