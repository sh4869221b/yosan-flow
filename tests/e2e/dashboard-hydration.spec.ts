import { expect, test, type Page } from "@playwright/test";
import {
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import {
  assertExactDialog,
  assertUnchangedPair,
  proposeBoundaryChange,
  readPeriod,
  readPeriodList,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";
import { seedPeriod } from "./helpers/db";

async function delayClientEntry(page: Page) {
  const clientRequested = Promise.withResolvers<void>();
  const releaseClient = Promise.withResolvers<void>();
  const clientEntry = /\/_app\/immutable\/entry\/start\.[^/]+\.js$/;
  await page.route(clientEntry, async (route) => {
    clientRequested.resolve();
    await releaseClient.promise;
    await route.continue();
  });
  return {
    clientRequested,
    releaseClient,
    dispose: async () => {
      releaseClient.resolve();
      await page.unroute(clientEntry);
    },
  };
}

test("waits for hydration before editing server-rendered settings", async ({
  page,
  request,
}) => {
  await resetTestData(request);
  await seedBoundaryPair(request);
  const { clientRequested, releaseClient, dispose } =
    await delayClientEntry(page);

  try {
    await page.goto(`${getBaseUrl()}/?periodId=${target.periodId}`, {
      waitUntil: "domcontentloaded",
    });
    await clientRequested.promise;
    const settings = page.getByText("期間の終了日や予算を変更する");
    await expect(settings).toBeVisible();
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");

    const ready = waitForDashboardReady(page);
    releaseClient.resolve();
    await ready;
    await settings.click();
    await page.getByLabel("期間予算 (円)").fill("123456");
    await proposeBoundaryChange(page);
    await assertExactDialog(page);
    await expect(page.getByLabel("期間予算 (円)")).toHaveValue("123456");
    await assertUnchangedPair(request);
  } finally {
    await dispose();
  }
});

for (const navigation of ["navigation", "reload"] as const) {
  test(`waits for hydration after ${navigation} before validating and submitting an initial period`, async ({
    page,
    request,
  }) => {
    await resetTestData(request);
    if (navigation === "reload") {
      await page.goto(getBaseUrl());
      await waitForDashboardReady(page);
    }
    const { clientRequested, releaseClient, dispose } =
      await delayClientEntry(page);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT"].includes(request.method()))
        writes.push(request.url());
    });

    try {
      if (navigation === "reload") {
        await page.reload({ waitUntil: "domcontentloaded" });
      } else {
        await page.goto(getBaseUrl(), { waitUntil: "domcontentloaded" });
      }
      await clientRequested.promise;
      const start = page.getByTestId("initial-period-range-start");
      const id = page.getByLabel("期間ID", { exact: true });
      await expect(start).toBeVisible();
      await expect(start).toBeEnabled();
      await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");

      const ready = waitForDashboardReady(page);
      releaseClient.resolve();
      await ready;
      await start.fill("2026-09-");
      await page.getByTestId("initial-period-range-end").fill("2026-09-30");
      await page.getByLabel("新規予算額 (円)").fill("130000");
      await id.fill("p-hydrated-initial");
      await page
        .getByRole("button", { name: "期間を作成", exact: true })
        .click();
      await expect(start).toBeFocused();
      await expect(start).toHaveValue("2026-09-");
      await expect(start).toHaveAttribute("aria-invalid", "true");
      await expect(start).toHaveAccessibleDescription(/有効な開始日/);
      expect(writes).toEqual([]);
      expect(await readPeriodList(request)).toEqual([]);

      await start.fill("2026-09-01");
      await expect(start).toHaveAttribute("aria-invalid", "false");
      await id.press("Enter");
      await expect(page.getByTestId("period-select")).toHaveValue(
        "p-hydrated-initial",
      );
      await expect(page.locator("#selected-period-heading")).toBeFocused();
      expect(writes).toEqual([`${getBaseUrl()}/api/periods`]);
      expect(await readPeriod(request, "p-hydrated-initial")).toMatchObject({
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        budgetYen: 130000,
      });
    } finally {
      await dispose();
    }
  });
}

test("waits for hydration before calendar keys and additional period creation", async ({
  page,
  request,
}) => {
  await resetTestData(request);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-hydrated-calendar",
    startDate: "2026-01-20",
    endDate: "2026-02-10",
    budgetYen: 120000,
  });
  const { clientRequested, releaseClient, dispose } =
    await delayClientEntry(page);

  try {
    await page.goto(`${getBaseUrl()}/?periodId=p-hydrated-calendar`, {
      waitUntil: "domcontentloaded",
    });
    await clientRequested.promise;
    const januaryEnd = page.getByTestId("calendar-day-2026-01-31");
    const februaryStart = page.getByTestId("calendar-day-2026-02-01");
    const additional = page.getByTestId("create-period-panel");
    await expect(januaryEnd).toBeVisible();
    await expect(januaryEnd).toBeEnabled();
    await expect(additional.locator("summary")).toBeVisible();
    await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");

    const ready = waitForDashboardReady(page);
    releaseClient.resolve();
    await ready;
    await januaryEnd.focus();
    await januaryEnd.press("ArrowRight");
    await expect(februaryStart).toBeFocused();
    await expect(
      page.locator('[data-testid^="calendar-day-"][tabindex="0"]'),
    ).toHaveCount(1);
    await februaryStart.press("Enter");
    const modal = page.getByTestId("day-entry-modal");
    await expect(modal).toContainText("対象日: 2026-02-01");
    await modal.getByRole("button", { name: "閉じる" }).click();
    await expect(modal).not.toBeVisible();
    await expect(februaryStart).toBeFocused();
    await expect(februaryStart).toHaveAttribute("aria-pressed", "true");

    await additional.locator("summary").click();
    await additional
      .getByTestId("create-period-range-start")
      .fill("2026-02-11");
    await additional.getByTestId("create-period-range-end").fill("2026-03-10");
    await additional.getByLabel("新規予算額 (円)").fill("90000");
    await additional
      .getByLabel("期間ID", { exact: true })
      .fill("p-hydrated-next");
    await additional.getByLabel("期間ID", { exact: true }).press("Enter");
    await expect(page.getByTestId("period-select")).toHaveValue(
      "p-hydrated-next",
    );
    await expect(page.locator("#selected-period-heading")).toBeFocused();
    expect(await readPeriod(request, "p-hydrated-next")).toMatchObject({
      startDate: "2026-02-11",
      endDate: "2026-03-10",
      budgetYen: 90000,
    });
  } finally {
    await dispose();
  }
});
