import { expect, test } from "@playwright/test";
import {
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import {
  assertExactDialog,
  assertUnchangedPair,
  proposeBoundaryChange,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";

test("waits for hydration before editing server-rendered settings", async ({
  page,
  request,
}) => {
  await resetTestData(request);
  await seedBoundaryPair(request);
  const clientRequested = Promise.withResolvers<void>();
  const releaseClient = Promise.withResolvers<void>();
  const clientEntry = /\/_app\/immutable\/entry\/start\.[^/]+\.js$/;
  await page.route(clientEntry, async (route) => {
    clientRequested.resolve();
    await releaseClient.promise;
    await route.continue();
  });

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
    releaseClient.resolve();
    await page.unroute(clientEntry);
  }
});
