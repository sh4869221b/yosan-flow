import { expect, test } from "@playwright/test";
import { getBaseUrl } from "./dashboard-shared";
import {
  proposeNextBoundary,
  countConfirmations,
  gotoTarget,
  proposeBoundaryChange,
  readPeriod,
  seedBoundaryPair,
  successor,
  target,
  updatePeriod,
} from "./period-boundary-confirmation-helpers";

test("clears the spending warning after the confirmed boundary PUT even when summary GET fails", async ({
  page,
  request,
}) => {
  await seedBoundaryPair(request);
  await gotoTarget(page);
  const summaryUrl = `${getBaseUrl()}/api/periods/${target.periodId}`;
  await page.route(
    `${summaryUrl}/days/${target.startDate}/add`,
    async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.fulfill({ status: 204 });
    },
  );
  await page.route(summaryUrl, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 503 })
      : route.continue(),
  );
  const waitForFailedSummary = () =>
    page.waitForResponse(
      (response) =>
        response.url() === summaryUrl &&
        response.request().method() === "GET" &&
        response.status() === 503,
    );

  const day = page.getByTestId(`calendar-day-${target.startDate}`);
  const used = day.getByTestId(`used-${target.startDate}`);
  await day.click();
  const modal = page.getByTestId("day-entry-modal");
  await modal.getByLabel("追加する支出額 (円)").fill("300");
  const failedAfterSave = waitForFailedSummary();
  await modal.getByRole("button", { name: "支出を追加" }).click();
  await failedAfterSave;
  await expect(modal).toBeHidden();
  const warning = page.getByTestId("day-entry-summary-unsynced");
  await expect(warning).toBeVisible();
  await expect(used).toHaveText("0 円");

  await proposeBoundaryChange(page);
  const confirmed = page.waitForResponse(
    (response) =>
      response.url() === summaryUrl &&
      response.request().method() === "PUT" &&
      response.request().postDataJSON().confirmation != null,
  );
  const failedAfterBoundary = waitForFailedSummary();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "変更する" })
    .click();
  expect((await confirmed).status()).toBe(200);
  await failedAfterBoundary;

  await expect(page.locator("#range-confirmation-feedback")).toContainText(
    "期間の保存は完了しています",
  );
  await expect(used).toHaveText("300 円");
  await expect(warning).toHaveCount(0);
});

for (const failingGet of ["list", "summary", "saved-list"] as const) {
  test(`recovers ${failingGet === "saved-list" ? "saved update" : "real conflict"} after ${failingGet} GET failure with GET-only retry`, async ({
    page,
    request,
  }) => {
    const saved = failingGet === "saved-list";
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await page.getByText("期間の日付や予算を変更する").click();
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
    const confirmPuts = countConfirmations(page);
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
      await expect(page.locator("#range-confirmation-feedback")).toContainText(
        "期間の保存は完了しています",
      );
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
    expect(confirmPuts()).toBe(1);
    expect(await readPeriod(request, target.periodId)).toMatchObject({
      ...target,
      endDate: saved ? "2026-07-21" : target.endDate,
    });
    expect((await readPeriod(request, successor.periodId)).budgetYen).toBe(
      saved ? successor.budgetYen : 91000,
    );
  });
}

test("recovers a saved next-period boundary with GET-only retry", async ({
  page,
  request,
}) => {
  await proposeNextBoundary(page, request);
  const confirmPuts = countConfirmations(page);
  let failures = 0;
  await page.route("**/api/periods", async (route) => {
    if (route.request().method() === "GET" && failures++ === 0) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "最新情報を取得できませんでした。" },
        }),
      });
    } else await route.continue();
  });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "変更する" })
    .click();
  await expect(page.locator("#range-confirmation-feedback")).toContainText(
    "期間の保存は完了しています",
  );
  await page
    .getByRole("button", { name: "最新情報を再取得", exact: true })
    .click();
  await expect(page.getByTestId("period-select")).toHaveValue(
    successor.periodId,
  );
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    "2026-07-20",
  );
  expect(confirmPuts()).toBe(1);
  expect((await readPeriod(request, target.periodId)).endDate).toBe(
    "2026-07-19",
  );
  expect((await readPeriod(request, successor.periodId)).startDate).toBe(
    "2026-07-20",
  );
});
