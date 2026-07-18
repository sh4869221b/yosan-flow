import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resetTestData } from "./dashboard-shared";
import {
  assertExactDialog,
  assertUnchangedPair,
  assertUpdatedPair,
  gotoTarget,
  proposeBoundaryChange,
  readPeriodList,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";

export function registerPeriodBoundarySuccessScenarios(): void {
  test("shows an accessible boundary confirmation and cancels without writing", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedBoundaryPair(request);
    let confirmPutCount = 0;
    page.on("request", (outgoingRequest) => {
      if (outgoingRequest.method() !== "PUT") return;
      const body: unknown = outgoingRequest.postDataJSON();
      if (
        typeof body === "object" &&
        body != null &&
        "confirmation" in body &&
        body.confirmation != null
      ) {
        confirmPutCount += 1;
      }
    });

    await gotoTarget(page);
    await proposeBoundaryChange(page);
    const dialog = page.getByRole("alertdialog");
    await assertExactDialog(page);

    const cancelButton = dialog.getByRole("button", { name: "キャンセル" });
    const actionButton = dialog.getByRole("button", { name: "変更する" });
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(actionButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelButton).toBeFocused();
    await expect(page.getByTestId("current-period-range-start")).toBeDisabled();
    await expect(page.getByTestId("current-period-range-end")).toBeDisabled();
    await expect(page.getByTestId("current-period-range-apply")).toBeDisabled();
    await expect(page.getByTestId("current-period-range-apply")).toHaveText(
      "期間を反映",
    );
    await expect(page.getByLabel("期間予算 (円)")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "期間を更新" }),
    ).toBeDisabled();
    await expect(page.getByTestId("period-select")).toBeDisabled();

    await page.screenshot({
      path: ".omo/evidence/issue-237/task-5-desktop.png",
    });
    await cancelButton.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("current-period-range-start")).toHaveValue(
      target.startDate,
    );
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      target.endDate,
    );

    await proposeBoundaryChange(page);
    await expect(dialog).toHaveCount(1);
    await expect(cancelButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      target.endDate,
    );
    expect(confirmPutCount).toBe(0);

    const cancelledPair = await assertUnchangedPair(request);
    await writeFile(
      ".omo/evidence/issue-237/task-5-api.json",
      `${JSON.stringify(cancelledPair, null, 2)}\n`,
    );
  });

  test.describe("stale confirmation, no-dialog cases, and double submit", () => {
    test("confirms one linked boundary update on desktop and mobile", async ({
      page,
      request,
    }) => {
      const actions: Array<Record<string, unknown>> = [];
      const apiStates: Record<string, unknown> = {};

      await page.setViewportSize({ width: 1280, height: 720 });
      await seedBoundaryPair(request);
      await gotoTarget(page);
      await proposeBoundaryChange(page);
      await assertExactDialog(page);
      await page.screenshot({
        path: ".omo/evidence/issue-237/task-6-desktop-proposal.png",
      });

      const releaseConfirm = Promise.withResolvers<void>();
      const confirmArrived = Promise.withResolvers<void>();
      let confirmPutCount = 0;
      await page.route(`**/api/periods/${target.periodId}`, async (route) => {
        if (
          route.request().method() === "PUT" &&
          route.request().postDataJSON().confirmation != null
        ) {
          confirmPutCount += 1;
          confirmArrived.resolve();
          await releaseConfirm.promise;
        }
        await route.continue();
      });

      const action = page
        .getByRole("alertdialog")
        .getByRole("button", { name: "変更する" });
      await action.evaluate((button) => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await confirmArrived.promise;
      expect(confirmPutCount).toBe(1);
      await expect(page.getByRole("alertdialog")).toHaveCount(1);
      await expect(
        page
          .getByRole("alertdialog")
          .getByRole("button", { name: "変更中..." }),
      ).toBeDisabled();
      actions.push({
        phase: "desktop-blocked",
        confirmPutCount,
        disabled: true,
      });
      releaseConfirm.resolve();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(confirmPutCount).toBe(1);

      const desktopPair = await assertUpdatedPair(request);
      const desktopList = await readPeriodList(request);
      expect(desktopList).toEqual(
        expect.arrayContaining([
          expect.objectContaining(desktopPair.target),
          expect.objectContaining(desktopPair.successor),
        ]),
      );
      await expect(page.getByTestId("current-period-range-end")).toHaveValue(
        "2026-07-21",
      );
      await expect(
        page.getByText("期間: 2026-06-21 - 2026-07-21"),
      ).toBeVisible();
      await page.screenshot({
        path: ".omo/evidence/issue-237/task-6-desktop.png",
      });
      apiStates.desktop = { ...desktopPair, list: desktopList };
      actions.push({ phase: "desktop-complete", confirmPutCount });

      await resetTestData(request);
      await seedBoundaryPair(request);
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoTarget(page);
      await proposeBoundaryChange(page);
      await assertExactDialog(page);
      const dialog = page.getByRole("alertdialog");
      await expect(
        dialog.getByRole("button", { name: "キャンセル" }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "変更する" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: ".omo/evidence/issue-237/task-6-mobile-proposal.png",
      });
      await dialog.getByRole("button", { name: "変更する" }).click();
      await expect(dialog).toHaveCount(0);
      const mobilePair = await assertUpdatedPair(request);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: ".omo/evidence/issue-237/task-6-mobile.png",
      });
      apiStates.mobile = mobilePair;
      actions.push({ phase: "mobile-complete", horizontalOverflow: false });

      await writeFile(
        ".omo/evidence/issue-237/task-6-api.json",
        `${JSON.stringify(apiStates, null, 2)}\n`,
      );
      await writeFile(
        ".omo/evidence/issue-237/task-6-actions.json",
        `${JSON.stringify(actions, null, 2)}\n`,
      );
    });
  });
}
