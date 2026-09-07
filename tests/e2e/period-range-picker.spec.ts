import { expect, test } from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import { getBaseUrl, resetTestData, warmUpBrowser } from "./dashboard-shared";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeEach(async ({ browser, request }) => {
  await resetTestData(request);
  await warmUpBrowser(browser);
});

test("raw input retains invalid text, associates errors, and makes no mutation", async ({
  page,
  request,
}) => {
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-360",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });

  await page.goto(`${getBaseUrl()}/?periodId=p-range-360`);
  await page.getByText("期間の終了日や予算を変更する").click();

  let mutationCount = 0;
  page.on("request", (request) => {
    if (
      request.url().startsWith(getBaseUrl()) &&
      ["POST", "PUT", "DELETE"].includes(request.method())
    ) {
      mutationCount += 1;
    }
  });

  const start = page.getByTestId("current-period-range-start");
  const end = page.getByTestId("current-period-range-end");
  await start.fill("2026-09-");
  await start.blur();
  await expect(start).toHaveValue("2026-09-");
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(start).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-error/,
  );
  await expect(
    page.getByText("有効な開始日を入力してください。"),
  ).toBeVisible();

  await end.fill("2026-02-30");
  await end.blur();
  await expect(end).toHaveValue("2026-02-30");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(end).toHaveAttribute(
    "aria-describedby",
    /current-period-range-end-error/,
  );
  await expect(
    page.getByText("有効な終了日を入力してください。"),
  ).toBeVisible();

  await start.fill("2026-09-30");
  await end.fill("2026-09-01");
  await end.blur();
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(end).toHaveAttribute("aria-invalid", "true");
  await expect(start).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-range-error/,
  );
  await expect(end).toHaveAttribute(
    "aria-describedby",
    /current-period-range-start-range-error/,
  );
  if (process.env.YOSAN_FLOW_EVIDENCE_DIR) {
    await page.screenshot({
      path: `${process.env.YOSAN_FLOW_EVIDENCE_DIR}/raw-errors.png`,
      fullPage: true,
    });
  }
  await page.getByTestId("current-period-range-apply").click();
  expect(mutationCount).toBe(0);
  await expect(start).toBeFocused();
  await expect(start).toHaveValue("2026-09-30");
  await expect(end).toHaveValue("2026-09-01");

  await end.fill("2026-09-30");
  await expect(start).toHaveAttribute("aria-invalid", "false");
  await expect(end).toHaveAttribute("aria-invalid", "false");
  await page.getByTestId("current-period-range-apply").click();
  await expect(page.getByText("期間: 2026-09-30 - 2026-09-30")).toBeVisible();
  await start.fill("2026-09-");
  await expect(start).toHaveAttribute("aria-invalid", "false");
});

test("create apply updates initial and additional range only after valid apply", async ({
  page,
  request,
}) => {
  await page.goto(getBaseUrl());
  const initialId = page.getByLabel("期間ID");
  const initialStart = page.getByTestId("initial-period-range-start");
  await page.getByTestId("initial-period-range-apply").click();
  await initialStart.fill("2026-09-");
  await expect(initialStart).toHaveAttribute("aria-invalid", "false");
  await initialId.fill("custom-initial-id");
  await initialStart.fill("2026-10-01");
  await page.getByTestId("initial-period-range-end").fill("2026-10-31");
  await expect(initialId).toHaveValue("custom-initial-id");
  await page.getByTestId("initial-period-range-apply").click();
  await expect(initialId).toHaveValue("p-2026-10-01");
  await expect(page.getByTestId("initial-period-range-start")).toHaveValue(
    "2026-10-01",
  );
  await expect(page.getByTestId("initial-period-range-end")).toHaveValue(
    "2026-10-31",
  );

  await resetTestData(request);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-range-create-current",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    budgetYen: 120000,
  });
  await page.goto(getBaseUrl());
  await page.getByText("次の予算期間を作成する").click();
  const additionalId = page.getByLabel("期間ID");
  await additionalId.fill("custom-additional-id");
  await page.getByTestId("create-period-range-start").fill("2026-10-01");
  await page.getByTestId("create-period-range-end").fill("2026-10-31");
  await expect(additionalId).toHaveValue("custom-additional-id");
  await page.getByTestId("create-period-range-apply").click();
  await expect(additionalId).toHaveValue("p-2026-10-01");
});
