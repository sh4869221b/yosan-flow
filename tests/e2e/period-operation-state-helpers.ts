import { expect, type APIResponse, type Page } from "@playwright/test";
import { getBaseUrl } from "./dashboard-shared";

export const period = {
  periodId: "p-2026-09-01",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  budgetYen: 120000,
} as const;

export const changedRange = {
  startDate: "2026-09-02",
  endDate: "2026-09-29",
} as const;

export const periodUrl = `${getBaseUrl()}/api/periods/${period.periodId}`;
export const listUrl = `${getBaseUrl()}/api/periods`;

export function controls(page: Page) {
  const budgetRegion = page.getByRole("region", {
    name: "予算設定",
    exact: true,
    includeHidden: true,
  });
  const createPanel = page.getByTestId("create-period-panel");
  return {
    budgetRegion,
    budget: budgetRegion.getByRole("button", { includeHidden: true }),
    range: page.getByTestId("current-period-range-apply"),
    createPanel,
    create: createPanel.getByRole("button", {
      name: /^(期間を作成|作成中\.\.\.)$/,
      includeHidden: true,
    }),
    selector: page.getByTestId("period-select"),
  };
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByText("期間の終了日や予算を変更する").click();
  await page.getByText("次の予算期間を作成する", { exact: true }).click();
  await expect(page.getByLabel("期間予算 (円)")).toHaveValue("120000");
}

export async function fillDrafts(page: Page): Promise<void> {
  await page.getByLabel("期間予算 (円)").fill("130000");
  await page
    .getByTestId("current-period-range-start")
    .fill(changedRange.startDate);
  await page.getByTestId("current-period-range-end").fill(changedRange.endDate);
}

export function waitForResponse(page: Page, url: string, method: string) {
  return page.waitForResponse(
    (response) =>
      response.url() === url && response.request().method() === method,
  );
}

export async function waitForUpdate(page: Page, status = 200, url = periodUrl) {
  const [put, list, summary] = await Promise.all([
    waitForResponse(page, url, "PUT"),
    waitForResponse(page, listUrl, "GET"),
    waitForResponse(page, url, "GET"),
  ]);
  expect(put.status()).toBe(status);
  expect(list.status()).toBe(200);
  expect(summary.status()).toBe(200);
  await expect(controls(page).budget).toBeEnabled();
  return put;
}

export async function holdResponse(page: Page, url: string, method: string) {
  const arrived = Promise.withResolvers<APIResponse>();
  const released = Promise.withResolvers<void>();
  await page.route(url, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    arrived.resolve(response);
    await released.promise;
    await route.fulfill({ response });
  });
  return { arrived: arrived.promise, release: released.resolve };
}

export async function expectManagementDisabled(page: Page): Promise<void> {
  const ui = controls(page);
  await expect(ui.budget).toBeDisabled();
  await expect(ui.range).toBeDisabled();
  await expect(ui.create).toBeDisabled();
  await expect(ui.selector).toBeDisabled();
  await expect(page.getByLabel("期間予算 (円)")).toBeDisabled();
}

export async function expectFailureLocal(
  page: Page,
  budgetFailure: boolean,
): Promise<void> {
  const ui = controls(page);
  const alerts = page
    .getByRole("region", { name: "期間設定", exact: true })
    .getByRole("alert");
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toHaveText(
    budgetFailure ? "budget-save-failure" : "range-save-failure",
  );
  await expect(ui.budgetRegion.getByRole("alert")).toHaveCount(
    budgetFailure ? 1 : 0,
  );
  await expect(ui.createPanel.getByRole("alert")).toHaveCount(0);
}
