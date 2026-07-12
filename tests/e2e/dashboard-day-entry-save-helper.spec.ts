import { expect, test } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  isExactDayEntryAddResponse,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
  SuccessfulDayEntrySaveError,
} from "./dashboard-day-entry-helpers";
import { getBaseUrl } from "./dashboard-shared";

configureDashboardDayEntryE2E();

test("matches only the exact absolute add response URL", async ({ page }) => {
  // Given: exact, query-bearing, and wrong-origin POST responses for one add path.
  await page.goto(getBaseUrl());
  const addPath = "/api/periods/p-url-proof/days/2026-07-12/add";
  const exactUrl = new URL(addPath, page.url()).href;
  const queryUrl = `${exactUrl}?probe=query`;
  const wrongOriginUrl = new URL(addPath, "http://localhost:4173").href;
  await page.route(`**${addPath}*`, async (route) => {
    await route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  const exactResponse = page.waitForResponse(
    (response) => response.url() === exactUrl,
  );
  const queryResponse = page.waitForResponse(
    (response) => response.url() === queryUrl,
  );
  const wrongOriginResponse = page.waitForResponse(
    (response) => response.url() === wrongOriginUrl,
  );

  // When: the browser emits all three real responses.
  await page.evaluate(
    async ({ exact, query, wrongOrigin }) => {
      await Promise.all([
        fetch(query, { method: "POST" }),
        fetch(wrongOrigin, { method: "POST" }),
        fetch(exact, { method: "POST" }),
      ]);
    },
    { exact: exactUrl, query: queryUrl, wrongOrigin: wrongOriginUrl },
  );
  const [exact, query, wrongOrigin] = await Promise.all([
    exactResponse,
    queryResponse,
    wrongOriginResponse,
  ]);

  // Then: only the exact same-origin URL satisfies the helper matcher.
  expect(isExactDayEntryAddResponse(exact, exactUrl)).toBe(true);
  expect(isExactDayEntryAddResponse(query, exactUrl)).toBe(false);
  expect(isExactDayEntryAddResponse(wrongOrigin, exactUrl)).toBe(false);
});

test("returns after a successful add closes the modal", async ({
  page,
  request,
}) => {
  // Given: a seeded period with an open day-entry modal.
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();
  await modal.getByLabel("入力額 (円)").fill("2000");
  await modal.getByLabel("メモ").fill("helper lifecycle proof");

  // When: the shared helper drives the successful save lifecycle.
  await saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "happy-path add",
  });

  // Then: it is safe to reopen immediately and observe persisted history.
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  await expect(modal.getByText("helper lifecycle proof")).toBeVisible();
});

test("rejects a failed add and leaves the modal input visible", async ({
  page,
  request,
}) => {
  // Given: an open day-entry modal whose exact add endpoint returns 503.
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  await page.goto(`${getBaseUrl()}/?periodId=${encodeURIComponent(periodId)}`);
  await page.route(
    `**/api/periods/${periodId}/days/${todayDate}/add`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_SAVE_FAILURE",
            message: "日次入力の保存に失敗しました。",
          },
        }),
      });
    },
  );
  await page.getByTestId(`calendar-day-${todayDate}`).click();
  const modal = page.getByTestId("day-entry-modal");
  await modal.getByLabel("入力額 (円)").fill("2000");

  // When: the helper observes the unsuccessful POST response.
  const save = saveDayEntrySuccessfully({
    page,
    modal,
    periodId,
    date: todayDate,
    responseAssertionContext: "503 control",
  });

  // Then: it rejects with response context instead of treating 503 as success.
  await expect(save).rejects.toMatchObject({
    name: SuccessfulDayEntrySaveError.name,
    status: 503,
    context: "503 control",
  });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("入力額 (円)")).toHaveValue("2000");
});
