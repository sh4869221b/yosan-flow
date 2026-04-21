import { expect, test } from "@playwright/test";
import { getBaseUrl, getCurrentJstYearMonth, startDevServer, stopDevServer, warmUpBrowser } from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser }, testInfo) => {
  testInfo.setTimeout(120_000);
  await stopDevServer();
  await startDevServer();
  await warmUpBrowser(browser);
});

test.afterEach(async () => {
  await stopDevServer();
});

test("shows budget input on dashboard", async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  await page.goto(`${getBaseUrl()}/`);

  await expect(page.getByTestId("budget-value")).toBeVisible();
  await expect(page.getByLabel("月予算 (円)")).toBeVisible();
});

test("sets and updates monthly budget", async ({ page }, testInfo) => {
  const yearMonth = getCurrentJstYearMonth();
  await page.goto(`${getBaseUrl()}/`);
  await page.getByLabel("月予算 (円)").fill("120000");
  await page.getByRole("button", { name: "予算を保存" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("120000");

  await page.getByLabel("月予算 (円)").fill("150000");
  await page.getByRole("button", { name: "予算を保存" }).click();
  await expect(page.getByTestId("budget-value")).toContainText("150000");
});
