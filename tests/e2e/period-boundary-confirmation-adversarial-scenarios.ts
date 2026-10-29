import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import {
  applyRange,
  proposeNextBoundary,
  assertExactDialog,
  assertUnchangedPair,
  gotoTarget,
  proposeBoundaryChange,
  readPeriod,
  seedBoundaryPair,
  successor,
  target,
  updatePeriod,
} from "./period-boundary-confirmation-helpers";

test.describe("stale confirmation, no-dialog cases, and double submit", () => {
  test("rejects a stale confirmation through the real public API", async ({
    page,
    request,
  }, testInfo) => {
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await proposeBoundaryChange(page);
    await assertExactDialog(page);

    const successorUpdate = await updatePeriod(request, successor.periodId, {
      startDate: successor.startDate,
      endDate: successor.endDate,
      budgetYen: 91_000,
    });
    expect(successorUpdate.status).toBe(200);
    const conflictResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().endsWith(`/api/periods/${target.periodId}`),
    );
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "変更する" })
      .click();
    const conflict = await conflictResponse;
    expect(conflict.status()).toBe(409);
    expect(await conflict.json()).toEqual({
      error: {
        code: "PERIOD_UPDATE_CONFLICT",
        message: "確認後に予算期間が変更されたため、もう一度操作してください。",
      },
    });
    await expect(page.locator("#range-confirmation-feedback")).toContainText(
      "もう一度編集してください。",
    );
    await expect(page.getByTestId("current-period-range-start")).toBeFocused();
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      target.endDate,
    );
    await proposeBoundaryChange(page);
    await assertExactDialog(page);
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "キャンセル" })
      .click();
    const targetState = await readPeriod(request, target.periodId);
    const successorState = await readPeriod(request, successor.periodId);
    expect(targetState).toMatchObject(target);
    expect(successorState).toMatchObject({
      periodId: successor.periodId,
      startDate: successor.startDate,
      endDate: successor.endDate,
      budgetYen: 91_000,
    });
    await writeFile(
      testInfo.outputPath("stale-api.json"),
      `${JSON.stringify({ target: targetState, successor: successorState }, null, 2)}\n`,
    );
  });

  for (const scenario of [
    {
      name: "start-only",
      range: { startDate: "2026-06-22", endDate: target.endDate },
      status: 200,
    },
  ] as const) {
    test(`keeps ${scenario.name} off the confirmation dialog`, async ({
      page,
      request,
    }) => {
      await seedBoundaryPair(request);
      await gotoTarget(page);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith(`/api/periods/${target.periodId}`),
      );
      await applyRange(page, scenario.range);
      expect((await responsePromise).status()).toBe(scenario.status);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });
  }

  test("shortens an unlinked adjacent period without moving its neighbor", async ({
    page,
    request,
  }) => {
    await seedPeriod(request, getBaseUrl(), target);
    await seedPeriod(request, getBaseUrl(), {
      periodId: successor.periodId,
      startDate: successor.startDate,
      endDate: successor.endDate,
      budgetYen: successor.budgetYen,
    });
    await gotoTarget(page);
    const response = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url() === `${getBaseUrl()}/api/periods/${target.periodId}`,
    );
    await applyRange(page, { endDate: "2026-07-19" });
    expect((await response).status()).toBe(200);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await readPeriod(request, target.periodId)).endDate).toBe(
      "2026-07-19",
    );
    expect((await readPeriod(request, successor.periodId)).startDate).toBe(
      successor.startDate,
    );
  });

  test("keeps budget-only, non-overlap extension, and no-successor updates off the dialog", async ({
    page,
    request,
  }) => {
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await page.getByText("期間の日付や予算を変更する").click();
    await page.getByLabel("期間予算 (円)").fill("121000");
    await page.getByRole("button", { name: "期間を更新" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByTestId("budget-value")).toContainText("121,000");

    await resetTestData(request);
    await seedPeriod(request, getBaseUrl(), {
      ...target,
      endDate: "2026-07-18",
    });
    await seedPeriod(request, getBaseUrl(), {
      periodId: "independent-later-period",
      startDate: "2026-07-21",
      endDate: successor.endDate,
      budgetYen: successor.budgetYen,
    });
    await gotoTarget(page);
    await applyRange(page, { endDate: "2026-07-19" });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await readPeriod(request, target.periodId)).endDate).toBe(
      "2026-07-19",
    );

    await resetTestData(request);
    await seedPeriod(request, getBaseUrl(), target);
    await gotoTarget(page);
    await applyRange(page, { endDate: "2026-07-21" });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect((await readPeriod(request, target.periodId)).endDate).toBe(
      "2026-07-21",
    );
  });

  for (const scenario of [
    {
      name: "invalid derived successor range",
      options: { successorEndDate: "2026-07-21" },
      code: "INVALID_PERIOD_RANGE",
      message: "開始日と終了日の範囲が不正です。",
    },
    {
      name: "displaced successor daily data",
      options: { successorDailyYen: 500 },
      code: "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
      message:
        "期間外に出る日次データが存在するため、この変更は適用できません。",
    },
  ] as const) {
    test(`rejects ${scenario.name} without writes`, async ({
      page,
      request,
    }) => {
      await seedBoundaryPair(request, scenario.options);
      await gotoTarget(page);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.url().endsWith(`/api/periods/${target.periodId}`),
      );
      await proposeBoundaryChange(page);
      const response = await responsePromise;
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({
        error: { code: scenario.code, message: scenario.message },
      });
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText(scenario.message);
      const targetState = await readPeriod(request, target.periodId);
      const successorState = await readPeriod(request, successor.periodId);
      expect(targetState).toMatchObject(target);
      expect(successorState).toMatchObject({
        periodId: successor.periodId,
        startDate: successor.startDate,
        endDate: scenario.options.successorEndDate ?? successor.endDate,
        budgetYen: successor.budgetYen,
      });
    });
  }
});

test("cancels and escapes a next-period proposal without confirming", async ({
  page,
  request,
}) => {
  await seedBoundaryPair(request);
  await page.goto(`${getBaseUrl()}/?periodId=${successor.periodId}`);
  await waitForDashboardReady(page);
  let confirmations = 0;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "PUT" && outgoing.postDataJSON().confirmation)
      confirmations++;
  });
  await applyRange(page, { startDate: "2026-07-20" });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "キャンセル" })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await applyRange(page, { startDate: "2026-07-20" });
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(confirmations).toBe(0);
  await assertUnchangedPair(request);
  await expect(page.getByTestId("period-select")).toHaveValue(
    successor.periodId,
  );
});

test("rejects a stale previous period while editing the next period", async ({
  page,
  request,
}) => {
  await proposeNextBoundary(page, request);
  expect(
    (
      await updatePeriod(request, target.periodId, {
        ...target,
        budgetYen: 121000,
      })
    ).status,
  ).toBe(200);
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url() === `${getBaseUrl()}/api/periods/${successor.periodId}`,
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "変更する" })
    .click();
  expect((await response).status()).toBe(409);
  await expect(page.locator("#range-confirmation-feedback")).toContainText(
    "もう一度編集してください。",
  );
  await expect(page.getByTestId("period-select")).toHaveValue(
    successor.periodId,
  );
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    successor.startDate,
  );
  expect((await readPeriod(request, target.periodId)).endDate).toBe(
    target.endDate,
  );
  expect((await readPeriod(request, successor.periodId)).startDate).toBe(
    successor.startDate,
  );
  await applyRange(page, { startDate: "2026-07-20" });
  await expect(page.getByRole("alertdialog")).toBeVisible();
});
