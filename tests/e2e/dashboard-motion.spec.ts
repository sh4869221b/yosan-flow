import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import {
  gotoTarget,
  proposeBoundaryChange,
  seedBoundaryPair,
} from "./period-boundary-confirmation-helpers";

configureDashboardDayEntryE2E();

for (const width of [375, 1280]) {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`motion respects ${reducedMotion} and keyboard focus at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.emulateMedia({ reducedMotion });
      const { periodId, todayDate } = await seedCurrentPeriod(request);
      await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
      await waitForDashboardReady(page);
      const action = page.getByRole("button", {
        name: "今日の支出を追加",
        exact: true,
      });
      await action.focus();
      await action.press("Enter");
      const modal = page.getByTestId("day-entry-modal");
      await expect(modal).toBeVisible();
      await expect(modal).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce"
          ? "none"
          : width <= 760
            ? "ui-sheet-in"
            : "ui-surface-in",
      );
      await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce" ? "none" : "ui-fade-in",
      );
      expect(
        await modal.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(action).toBeFocused();
      await action.press("Enter");
      await modal.getByLabel("追加する支出額 (円)").fill("500");
      await saveDayEntrySuccessfully({
        page,
        modal,
        periodId,
        date: todayDate,
      });
      const status = page.getByTestId("day-entry-save-status");
      await expect(status).toContainText("支出を保存しました。");
      await expect(status).toHaveCSS(
        "animation-name",
        reducedMotion === "reduce" ? "none" : "ui-fade-in",
      );
      await expect(action).toBeFocused();
      await expect(page.getByTestId("today-food-used")).toHaveText("500 円");
      if (reducedMotion === "reduce") {
        await expect(action).toHaveCSS("transition-property", "none");
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`nested mobile confirmation respects ${reducedMotion}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 375, height: 850 });
    await page.emulateMedia({ reducedMotion });
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await proposeBoundaryChange(page);
    const alert = page.getByRole("alertdialog");
    await expect(alert).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "ui-sheet-in",
    );
    await expect(page.locator('[data-slot="alert-dialog-overlay"]')).toHaveCSS(
      "animation-name",
      reducedMotion === "reduce" ? "none" : "ui-fade-in",
    );
    expect(
      await alert.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(alert).toHaveCount(0);
    await expect(page.getByTestId("current-period-range-end")).toBeVisible();
  });
}
