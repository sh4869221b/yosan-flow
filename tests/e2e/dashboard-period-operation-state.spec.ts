import { expect, test } from "@playwright/test";
import { getBaseUrl, resetTestData } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import {
  applyRange,
  assertUnchangedPair,
  assertUpdatedPair,
  gotoTarget,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";
import {
  changedRange,
  controls,
  expectFailureLocal,
  expectManagementDisabled,
  fillDrafts,
  holdResponse,
  listUrl,
  openSettings,
  period,
  periodUrl,
  waitForResponse,
  waitForUpdate,
} from "./period-operation-state-helpers";

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ request }) => {
  await resetTestData(request);
});

test.describe("independent period operations", () => {
  test.beforeEach(async ({ page, request }) => {
    await seedPeriod(request, getBaseUrl(), period);
    await page.goto(`${getBaseUrl()}/?periodId=${period.periodId}`);
    await openSettings(page);
  });

  test("B1 saves the committed budget when range is applied with a dirty budget", async ({
    page,
  }) => {
    // Given: both settings have distinct unsaved values.
    await fillDrafts(page);
    const updated = waitForUpdate(page);

    // When: the range is saved through the live API.
    await controls(page).range.click();
    const response = await updated;

    // Then: only the range is committed and the budget draft survives GET.
    expect(response.request().postDataJSON()).toEqual({
      budgetYen: 120000,
      ...changedRange,
    });
    await expect(
      page.getByText("期間: 2026-09-02 - 2026-09-29", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("budget-value")).toContainText("120,000");
    await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
  });

  for (const budgetFailure of [false, true]) {
    test(`B2 preserves the failed ${budgetFailure ? "budget" : "range"} when the counterpart succeeds`, async ({
      page,
    }) => {
      // Given: one failed save has reconciled successfully with the live API.
      await fillDrafts(page);
      const ui = controls(page);
      let putCount = 0;
      await page.route(periodUrl, async (route) => {
        if (route.request().method() === "PUT" && ++putCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                message: budgetFailure
                  ? "budget-save-failure"
                  : "range-save-failure",
              },
            }),
          });
          return;
        }
        await route.continue();
      });
      const failed = waitForUpdate(page, 500);
      await (budgetFailure ? ui.budget : ui.range).click();
      expect((await failed).request().postDataJSON()).toEqual(
        budgetFailure
          ? {
              budgetYen: 130000,
              startDate: period.startDate,
              endDate: period.endDate,
            }
          : { budgetYen: 120000, ...changedRange },
      );
      await expectFailureLocal(page, budgetFailure);
      await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
      await expect(page.getByTestId("current-period-range-start")).toHaveValue(
        changedRange.startDate,
      );
      await expect(page.getByTestId("current-period-range-end")).toHaveValue(
        changedRange.endDate,
      );

      // When: the other operation is saved and reconciled.
      const updated = waitForUpdate(page);
      await (budgetFailure ? ui.range : ui.budget).click();
      const response = await updated;

      // Then: its PUT excludes the failed setting and preserves local feedback.
      expect(response.request().postDataJSON()).toEqual(
        budgetFailure
          ? { budgetYen: 120000, ...changedRange }
          : {
              budgetYen: 130000,
              startDate: period.startDate,
              endDate: period.endDate,
            },
      );
      expect(putCount).toBe(2);
      await expectFailureLocal(page, budgetFailure);
      await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
      await expect(page.getByTestId("current-period-range-start")).toHaveValue(
        changedRange.startDate,
      );
      await expect(page.getByTestId("current-period-range-end")).toHaveValue(
        changedRange.endDate,
      );
      await expect(page.getByTestId("budget-value")).toContainText(
        budgetFailure ? "120,000" : "130,000",
      );
      await expect(
        page.getByText(
          budgetFailure
            ? "期間: 2026-09-02 - 2026-09-29"
            : "期間: 2026-09-01 - 2026-09-30",
          { exact: true },
        ),
      ).toBeVisible();
    });
  }

  for (const budgetSaving of [true, false]) {
    test(`B3 only labels ${budgetSaving ? "budget" : "range"} saving through PUT and reconciliation`, async ({
      page,
    }) => {
      // Given: each real response is held independently before its delivery.
      await fillDrafts(page);
      const ui = controls(page);
      const barriers = await Promise.all([
        holdResponse(page, periodUrl, "PUT"),
        holdResponse(page, listUrl, "GET"),
        holdResponse(page, periodUrl, "GET"),
      ]);
      const updated = waitForUpdate(page);
      try {
        // When: one operation is submitted through its normal button.
        await (budgetSaving ? ui.budget : ui.range).click();

        // Then: only its label is saving at every exact response barrier.
        for (const barrier of barriers) {
          expect((await barrier.arrived).status()).toBe(200);
          await expectManagementDisabled(page);
          await expect(
            ui.budgetRegion.getByRole("button", {
              name: "キャンセル",
              exact: true,
            }),
          ).toBeDisabled();
          await expect(ui.budget).toHaveText(
            budgetSaving ? "保存中..." : /^(期間を更新|読込中\.\.\.)$/,
          );
          await expect(ui.range).toHaveText(
            budgetSaving ? /^(期間を反映|読込中\.\.\.)$/ : "保存中...",
          );
          await expect(ui.create).toHaveText("期間を作成");
          await expect(page.getByRole("alert")).toHaveCount(0);
          barrier.release();
        }
      } finally {
        for (const barrier of barriers) barrier.release();
        await page.unrouteAll({ behavior: "wait" });
        await updated;
      }
      await expect(ui.budget).toHaveText("期間を更新");
      await expect(ui.range).toHaveText("期間を反映");
      await expect(ui.range).toBeEnabled({ enabled: budgetSaving });
      await expect(ui.create).toBeEnabled();
      await expect(ui.selector).toBeEnabled();
      await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
    });
  }
});

for (const confirm of [false, true]) {
  test(`B4 preserves a dirty budget when a live proposal is ${confirm ? "confirmed" : "cancelled"}`, async ({
    page,
    request,
  }) => {
    // Given: a live linked-period proposal excludes the dirty budget.
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await openSettings(page);
    await page.getByLabel("期間予算 (円)").fill("130000");
    const url = `${getBaseUrl()}/api/periods/${target.periodId}`;
    const writes: unknown[] = [];
    page.on("request", (outgoing) => {
      if (outgoing.method() === "PUT" && outgoing.url() === url) {
        writes.push(outgoing.postDataJSON());
      }
    });
    const payload = {
      budgetYen: 120000,
      startDate: target.startDate,
      endDate: "2026-07-21",
    };
    const proposed = waitForResponse(page, url, "PUT");
    await applyRange(page, { endDate: payload.endDate });
    const response = await proposed;
    expect(response.status()).toBe(409);
    expect(response.request().postDataJSON()).toEqual(payload);
    const proposalBody: unknown = await response.json();
    if (
      typeof proposalBody !== "object" ||
      proposalBody === null ||
      !("proposal" in proposalBody)
    ) {
      throw new Error("Missing proposal in boundary response");
    }
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: "キャンセル", exact: true }),
    ).toBeFocused();
    await expect(page.locator("#range-settings-heading")).not.toBeFocused();
    await expect(
      page
        .getByRole("form", {
          name: "期間設定",
          exact: true,
          includeHidden: true,
        })
        .getByRole("status", { includeHidden: true }),
    ).toHaveCount(0);
    await expectManagementDisabled(page);
    await expect(controls(page).range).toHaveText("期間を反映");
    await expect(page.getByRole("alert", { includeHidden: true })).toHaveCount(
      0,
    );

    // When: the user resolves the proposal through the existing dialog.
    if (confirm) {
      const updated = waitForUpdate(page, 200, url);
      await dialog
        .getByRole("button", { name: "変更する", exact: true })
        .click();
      expect((await updated).request().postDataJSON()).toEqual({
        ...payload,
        confirmation: proposalBody.proposal,
      });
    } else {
      await dialog
        .getByRole("button", { name: "キャンセル", exact: true })
        .click();
    }

    // Then: only confirmation writes; neither outcome changes the budget draft.
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(confirm ? 2 : 1);
    await expect(page.getByLabel("期間予算 (円)")).toHaveValue("130000");
    await expect(page.getByTestId("budget-value")).toContainText("120,000");
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      confirm ? payload.endDate : target.endDate,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(controls(page).budget).toBeEnabled();
    if (confirm) {
      await assertUpdatedPair(request);
    } else {
      await assertUnchangedPair(request);
    }
  });
}
