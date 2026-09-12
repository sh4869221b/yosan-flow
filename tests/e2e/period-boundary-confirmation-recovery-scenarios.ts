import { expect, test } from "@playwright/test";
import {
  gotoTarget,
  proposeBoundaryChange,
  readPeriod,
  seedBoundaryPair,
  successor,
  target,
  updatePeriod,
} from "./period-boundary-confirmation-helpers";

export function registerPeriodBoundaryRecoveryScenarios(): void {
  for (const failingGet of ["list", "summary", "saved-list"] as const) {
    test(`recovers ${failingGet === "saved-list" ? "saved update" : "real conflict"} after ${failingGet} GET failure with GET-only retry`, async ({
      page,
      request,
    }) => {
      const saved = failingGet === "saved-list";
      await seedBoundaryPair(request);
      await gotoTarget(page);
      await page.getByText("期間の終了日や予算を変更する").click();
      await page.getByLabel("期間予算 (円)").fill("123456");
      await proposeBoundaryChange(page);
      if (!saved)
        expect(
          (
            await updatePeriod(request, successor.periodId, {
              ...successor,
              budgetYen: 91000,
            })
          ).status,
        ).toBe(200);
      let confirmPuts = 0;
      page.on("request", (outgoing) => {
        if (outgoing.method() === "PUT" && outgoing.postDataJSON().confirmation)
          confirmPuts++;
      });
      let failures = 0;
      await page.route(
        failingGet !== "summary"
          ? "**/api/periods"
          : `**/api/periods/${target.periodId}`,
        async (route) => {
          if (route.request().method() === "GET" && failures < 2) {
            failures++;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                error: { message: "最新情報を取得できませんでした。" },
              }),
            });
          } else await route.continue();
        },
      );
      const conflict = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          response.request().postDataJSON().confirmation != null &&
          response.url().endsWith(`/api/periods/${target.periodId}`),
      );
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "変更する" })
        .click();
      expect((await conflict).status()).toBe(saved ? 200 : 409);
      const heading = page.locator("#range-confirmation-error-heading");
      const retry = page.getByRole("button", {
        name: "最新情報を再取得",
        exact: true,
      });
      await expect(heading).toBeFocused();
      if (saved)
        await expect(
          page.locator("#range-confirmation-feedback"),
        ).toContainText("期間の保存は完了しています");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await page.keyboard.press("Tab");
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(heading).toBeFocused();
      expect(failures).toBe(2);
      await page.keyboard.press("Tab");
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(
        saved
          ? page.locator("#range-settings-heading")
          : page.getByTestId("current-period-range-start"),
      ).toBeFocused();
      await expect(page.getByTestId("current-period-range-end")).toHaveValue(
        saved ? "2026-07-21" : target.endDate,
      );
      await expect(page.getByLabel("期間予算 (円)")).toHaveValue("123456");
      await expect(page.locator("#range-confirmation-feedback")).toContainText(
        saved ? "期間を保存しました。" : "もう一度編集してください。",
      );
      expect(confirmPuts).toBe(1);
      expect(await readPeriod(request, target.periodId)).toMatchObject({
        ...target,
        endDate: saved ? "2026-07-21" : target.endDate,
      });
      expect((await readPeriod(request, successor.periodId)).budgetYen).toBe(
        saved ? successor.budgetYen : 91000,
      );
    });
  }
}
