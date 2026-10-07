import { expect, test } from "@playwright/test";
import {
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";

test("retries a framework page-load error without losing URL or focus", async ({
  page,
  request,
}) => {
  await resetTestData(request);
  const initialUrl = `${getBaseUrl()}/?periodId=before-retry`;
  const retryUrl = `${getBaseUrl()}/?periodId=after-retry&keep=1#empty-period-heading`;
  await page.goto(initialUrl);
  await waitForDashboardReady(page);
  await expect(page.locator("#empty-period-heading")).toBeVisible();

  const releaseRetry = Promise.withResolvers<void>();
  let loads = 0;
  await page.route("**/__data.json?*", async (route) => {
    loads += 1;
    if (loads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary page-load failure" }),
      });
      return;
    }
    await releaseRetry.promise;
    await route.continue();
  });

  // Exercise the framework router rather than the dashboard's API controller.
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = "Retry destination";
    link.dataset.sveltekitPreloadData = "false";
    document.body.appendChild(link);
  }, retryUrl);
  try {
    await page.getByRole("link", { name: "Retry destination" }).click();
    await expect(page.locator("#page-error-heading")).toBeVisible();
    await expect(page.getByText("Temporary page-load failure")).toBeVisible();
    await expect(page).toHaveURL(retryUrl);

    const retry = page.getByRole("button", { name: "再読み込み" });
    await retry.click();
    await expect.poll(() => loads).toBe(2);
    await expect(retry).toHaveAttribute("aria-disabled", "true");
    await retry.dispatchEvent("click");
    expect(loads).toBe(2);
    releaseRetry.resolve();
    await expect(page.locator("#empty-period-heading")).toBeFocused();
    await expect(page.locator("#page-error-heading")).toHaveCount(0);
    await expect(page).toHaveURL(retryUrl);
    expect(loads).toBe(2);
    await page.goBack();
    await expect(page).toHaveURL(initialUrl);
  } finally {
    releaseRetry.resolve();
  }
});

test("retains framework CSRF and reset authorization guards", async ({
  request,
}) => {
  const endpoint = `${getBaseUrl()}/api/__test/reset`;
  const crossSite = await request.post(endpoint, {
    headers: { origin: "https://untrusted.example" },
  });
  expect(crossSite.status()).toBe(403);
  expect(await crossSite.text()).toContain(
    "Cross-site POST form submissions are forbidden",
  );

  const wrongToken = await request.post(endpoint, {
    headers: {
      "content-type": "application/json",
      "x-yosan-flow-e2e-reset-token": "wrong-token",
    },
  });
  expect(wrongToken.status()).toBe(403);
  expect(await wrongToken.json()).toEqual({
    error: { code: "FORBIDDEN", message: "Forbidden" },
  });
});
