import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { getBaseUrl, resetTestData } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import {
  applyRange,
  assertExactDialog,
  gotoTarget,
  proposeBoundaryChange,
  readPeriod,
  seedBoundaryPair,
  successor,
  target,
  updatePeriod,
} from "./period-boundary-confirmation-helpers";

export function registerPeriodBoundaryAdversarialScenarios(): void {
  test.describe("stale confirmation, no-dialog cases, and double submit", () => {
    test("rejects a stale confirmation through the real public API", async ({
      page,
      request,
    }) => {
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
          message:
            "確認後に予算期間が変更されたため、もう一度操作してください。",
        },
      });
      await expect(page.getByRole("alert")).toContainText(
        "確認後に予算期間が変更されたため、もう一度操作してください。",
      );
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
        ".omo/evidence/issue-237/task-6-stale-api.json",
        `${JSON.stringify({ target: targetState, successor: successorState }, null, 2)}\n`,
      );
    });

    for (const scenario of [
      {
        name: "shortening",
        range: { startDate: target.startDate, endDate: "2026-07-19" },
        status: 400,
      },
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

    test("keeps budget-only, non-overlap extension, and no-successor updates off the dialog", async ({
      page,
      request,
    }) => {
      await seedBoundaryPair(request);
      await gotoTarget(page);
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
}
