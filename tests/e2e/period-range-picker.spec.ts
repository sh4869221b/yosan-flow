import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import { getBaseUrl, resetTestData, warmUpBrowser } from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

test("raw input retains invalid text, associates errors, and makes no mutation", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-360",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=p-range-360`);
  await page.getByText("期間の終了日や予算を変更する").click();

  let mutationCount = 0;
  page.on("request", (request) => {
    if (
      request.url().startsWith(getBaseUrl()) &&
      ["POST", "PUT", "DELETE"].includes(request.method())
    ) {
      mutationCount += 1;
    }
  });

  const start = page.getByTestId("current-period-range-start");
  const end = page.getByTestId("current-period-range-end");
  await start.fill("2026-09-");
  await start.blur();
  await expect(start).toHaveValue("2026-09-");
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(start).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-error/,
  );
  await expect(
    page.getByText("有効な開始日を入力してください。"),
  ).toBeVisible();

  await end.fill("2026-02-30");
  await end.blur();
  await expect(end).toHaveValue("2026-02-30");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(end).toHaveAttribute(
    "aria-describedby",
    /current-period-range-end-error/,
  );
  await expect(
    page.getByText("有効な終了日を入力してください。"),
  ).toBeVisible();

  await start.fill("2026-09-30");
  await end.fill("2026-09-01");
  await end.blur();
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(start).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-range-error/,
  );
  await expect(end).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-range-error/,
  );
  if (process.env.YOSAN_FLOW_EVIDENCE_DIR) {
    await page.screenshot({
      path: `${process.env.YOSAN_FLOW_EVIDENCE_DIR}/raw-errors.png`,
      fullPage: true,
    });
  }
  await page.getByTestId("current-period-range-apply").click();
  expect(mutationCount).toBe(0);
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("2026-09-30");
  await expect(end).toHaveValue("2026-09-01");

  await end.fill("2026-09-30");
  await expect(start).toHaveAttribute("aria-invalid", "false");
  await expect(end).toHaveAttribute("aria-invalid", "false");
  await page.getByTestId("current-period-range-apply").click();
  await expect(page.getByText("期間: 2026-09-30 - 2026-09-30")).toBeVisible();
  await start.fill("2026-09-");
  await expect(start).toHaveAttribute("aria-invalid", "false");
});

test("calendar sync publishes a partial selection without retaining the old end", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-sync",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=p-range-calendar-sync`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const calendar = page.locator("[data-range-calendar-root]").first();
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-10"]')
    .click();

  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    "2026-09-10",
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue("");

  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-10"]')
    .click();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    "2026-09-10",
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    "2026-09-10",
  );

  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-12"]')
    .click();
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-14"]')
    .click();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    "2026-09-12",
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    "2026-09-14",
  );
  await expect(
    calendar.locator('[data-range-calendar-day][data-value="2026-09-13"]'),
  ).toHaveAttribute("data-selected", "");
});

test("calendar starts a fresh range from invalid and reversed controlled raw values", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-raw",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=p-range-calendar-raw`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const start = page.getByTestId("current-period-range-start");
  const end = page.getByTestId("current-period-range-end");
  const calendar = page.locator("[data-range-calendar-root]").first();

  await start.fill("2026-09-");
  await end.fill("2026-09-30");
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-10"]')
    .click();
  await expect(start).toHaveValue("2026-09-10");
  await expect(end).toHaveValue("");

  await start.fill("2026-09-30");
  await end.fill("2026-09-01");
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-12"]')
    .click();
  await expect(start).toHaveValue("2026-09-12");
  await expect(end).toHaveValue("");

  await start.fill("");
  await end.fill("2026-09-30");
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-14"]')
    .click();
  await expect(start).toHaveValue("2026-09-14");
  await expect(end).toHaveValue("");
});

test("calendar synchronizes a parent period reset without retaining its old range", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-reset-current",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-reset-next",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=p-range-calendar-reset-current`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const calendar = page.locator("[data-range-calendar-root]").first();
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-12"]')
    .click();
  await calendar
    .locator('[data-range-calendar-day][data-value="2026-09-14"]')
    .click();
  await page
    .getByTestId("period-select")
    .selectOption("p-range-calendar-reset-next");

  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    "2026-10-01",
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    "2026-10-31",
  );
  await expect(
    calendar.locator('[data-range-calendar-day][data-value="2026-09-13"]'),
  ).toHaveCount(0);
});

test("calendar keyboard follows the manual inputs and updates the controlled range", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-keyboard",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${getBaseUrl()}/?periodId=p-range-calendar-keyboard`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const start = page.getByTestId("current-period-range-start");
  const end = page.getByTestId("current-period-range-end");
  const calendar = page.locator("[data-range-calendar-root]").first();
  const previousMonth = calendar.locator("button").first();
  const nextMonth = calendar.locator("button").last();
  await start.focus();
  await start.press("Tab");
  await expect(end).toBeFocused();
  await end.press("Tab");
  await expect(previousMonth).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(nextMonth).toBeFocused();
  await page.keyboard.press("Tab");

  const septemberSecond = calendar.locator(
    '[data-range-calendar-day][data-value="2026-09-02"]',
  );
  await expect(
    calendar.locator('[data-range-calendar-day][data-value="2026-09-01"]'),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(septemberSecond).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(start).toHaveValue("2026-09-02");
  await expect(end).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  if (process.env.YOSAN_FLOW_EVIDENCE_DIR) {
    await page.screenshot({
      path: `${process.env.YOSAN_FLOW_EVIDENCE_DIR}/task-3-desktop.png`,
      fullPage: true,
    });
  }
});

test("calendar disables its mouse and keyboard controls while a range save is held", async ({
  page,
  request,
}) => {
  const periodId = "p-range-calendar-disabled";
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const periodUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  const arrived = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  await page.route(periodUrl, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    arrived.resolve();
    await released.promise;
    await route.fulfill({ response });
  });

  const start = page.getByTestId("current-period-range-start");
  const end = page.getByTestId("current-period-range-end");
  const calendar = page.locator("[data-range-calendar-root]").first();
  const previousMonth = calendar.locator("button").first();
  const nextMonth = calendar.locator("button").last();
  const day = calendar.locator(
    '[data-range-calendar-day][data-value="2026-09-10"]',
  );

  try {
    await start.fill("2026-09-02");
    await end.fill("2026-09-29");
    await page.getByTestId("current-period-range-apply").click();
    await arrived.promise;

    await expect(start).toBeDisabled();
    await expect(end).toBeDisabled();
    await expect(previousMonth).toBeDisabled();
    await expect(nextMonth).toBeDisabled();
    await expect(day).toHaveAttribute("aria-disabled", "true");
    await day.focus();
    await day.press("Enter");
    await expect(start).toHaveValue("2026-09-02");
    await expect(end).toHaveValue("2026-09-29");

    released.resolve();
    await expect(start).toBeEnabled();
    await expect(end).toBeEnabled();
    await expect(previousMonth).toBeEnabled();
    await expect(nextMonth).toBeEnabled();
  } finally {
    released.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("calendar keeps day controls usable on a mobile viewport", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-calendar-mobile",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${getBaseUrl()}/?periodId=p-range-calendar-mobile`);
  await page.getByText("期間の終了日や予算を変更する").click();

  const day = page
    .locator("[data-range-calendar-root]")
    .first()
    .locator('[data-range-calendar-day][data-value="2026-09-10"]');
  const bounds = await day.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(42);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.YOSAN_FLOW_EVIDENCE_DIR) {
    await page.screenshot({
      path: `${process.env.YOSAN_FLOW_EVIDENCE_DIR}/task-3-mobile.png`,
      fullPage: true,
    });
  }
});

test("create apply updates initial and additional range only after valid apply", async ({
  page,
  request,
}) => {
  await page.goto(getBaseUrl());
  const initialId = page.getByLabel("期間ID");
  const initialStart = page.getByTestId("initial-period-range-start");
  await page.getByTestId("initial-period-range-apply").click();
  await initialStart.fill("2026-09-");
  await expect(initialStart).toHaveAttribute("aria-invalid", "false");
  await initialId.fill("custom-initial-id");
  await initialStart.fill("2026-10-01");
  await page.getByTestId("initial-period-range-end").fill("2026-10-31");
  await expect(initialId).toHaveValue("custom-initial-id");
  await page.getByTestId("initial-period-range-apply").click();
  await expect(initialId).toHaveValue("p-2026-10-01");
  await expect(page.getByTestId("initial-period-range-start")).toHaveValue(
    "2026-10-01",
  );
  await expect(page.getByTestId("initial-period-range-end")).toHaveValue(
    "2026-10-31",
  );

  await resetTestData(request);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-create-current",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });
  await page.goto(getBaseUrl());
  await page.getByText("次の予算期間を作成する").click();
  const additionalId = page.getByLabel("期間ID");
  await additionalId.fill("custom-additional-id");
  await page.getByTestId("create-period-range-start").fill("2026-10-01");
  await page.getByTestId("create-period-range-end").fill("2026-10-31");
  await expect(additionalId).toHaveValue("custom-additional-id");
  await page.getByTestId("create-period-range-apply").click();
  await expect(additionalId).toHaveValue("p-2026-10-01");
});
