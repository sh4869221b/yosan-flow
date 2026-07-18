import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { getBaseUrl, resetTestData } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";

const target = {
  periodId: "boundary-target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 120_000,
} as const;

const successor = {
  periodId: "boundary-successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 90_000,
  predecessorPeriodId: target.periodId,
} as const;

async function readPeriod(request: APIRequestContext, periodId: string) {
  const response = await request.get(
    `${getBaseUrl()}/api/periods/${encodeURIComponent(periodId)}`,
  );
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body == null ||
    !("periodId" in body) ||
    typeof body.periodId !== "string" ||
    !("startDate" in body) ||
    typeof body.startDate !== "string" ||
    !("endDate" in body) ||
    typeof body.endDate !== "string" ||
    !("budgetYen" in body) ||
    typeof body.budgetYen !== "number"
  ) {
    throw new Error(`Unexpected period response for ${periodId}`);
  }
  return {
    periodId: body.periodId,
    startDate: body.startDate,
    endDate: body.endDate,
    budgetYen: body.budgetYen,
  };
}

async function proposeBoundaryChange(page: Page): Promise<void> {
  const endDateInput = page.getByTestId("current-period-range-end");
  if (!(await endDateInput.isVisible())) {
    await page.getByText("期間の終了日や予算を変更する").click();
  }
  await endDateInput.fill("2026-07-21");
  await page.getByTestId("current-period-range-apply").click();
}

test.beforeEach(async ({ request }) => {
  await resetTestData(request);
  await seedPeriod(request, getBaseUrl(), target);
  await seedPeriod(request, getBaseUrl(), successor);
});

test("shows an accessible boundary confirmation and cancels without writing", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
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

  await page.goto(`${getBaseUrl()}/?periodId=${target.periodId}`);
  await proposeBoundaryChange(page);

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveCount(1);
  await expect(
    dialog.getByRole("heading", { name: "予算期間の境界を変更しますか？" }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "この変更により、後続の予算期間の開始日も変更されます。",
  );
  await expect(dialog).toContainText(
    "変更する期間 2026-06-21 ～ 2026-07-20 → 2026-06-21 ～ 2026-07-21",
  );
  await expect(dialog).toContainText(
    "後続期間 2026-07-21 ～ 2026-08-19 → 2026-07-22 ～ 2026-08-19",
  );

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
  await expect(page.getByRole("button", { name: "期間を更新" })).toBeDisabled();
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

  const targetAfterCancel = await readPeriod(request, target.periodId);
  const successorAfterCancel = await readPeriod(request, successor.periodId);
  expect(targetAfterCancel).toMatchObject(target);
  expect(successorAfterCancel).toMatchObject({
    periodId: successor.periodId,
    startDate: successor.startDate,
    endDate: successor.endDate,
    budgetYen: successor.budgetYen,
  });
  await writeFile(
    ".omo/evidence/issue-237/task-5-api.json",
    `${JSON.stringify({ target: targetAfterCancel, successor: successorAfterCancel }, null, 2)}\n`,
  );
});
