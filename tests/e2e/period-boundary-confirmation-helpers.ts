import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { getBaseUrl } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";

export const target = {
  periodId: "boundary-target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 120_000,
} as const;

export const successor = {
  periodId: "boundary-successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 90_000,
  predecessorPeriodId: target.periodId,
} as const;

export type PublicPeriod = {
  readonly periodId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
  readonly status: "active" | "closed";
};

function parsePublicPeriod(body: unknown, periodId: string): PublicPeriod {
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
    typeof body.budgetYen !== "number" ||
    !("status" in body) ||
    (body.status !== "active" && body.status !== "closed")
  ) {
    throw new Error(`Unexpected period response for ${periodId}`);
  }
  return {
    periodId: body.periodId,
    startDate: body.startDate,
    endDate: body.endDate,
    budgetYen: body.budgetYen,
    status: body.status,
  };
}

export async function readPeriod(
  request: APIRequestContext,
  periodId: string,
): Promise<PublicPeriod> {
  const response = await request.get(
    `${getBaseUrl()}/api/periods/${encodeURIComponent(periodId)}`,
  );
  expect(response.status()).toBe(200);
  return parsePublicPeriod(await response.json(), periodId);
}

export async function readPeriodList(
  request: APIRequestContext,
): Promise<readonly PublicPeriod[]> {
  const response = await request.get(`${getBaseUrl()}/api/periods`);
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body == null ||
    !("periods" in body) ||
    !Array.isArray(body.periods)
  ) {
    throw new Error("Unexpected period list response");
  }
  return body.periods.map((period, index) => {
    if (
      typeof period !== "object" ||
      period == null ||
      !("id" in period) ||
      typeof period.id !== "string"
    ) {
      throw new Error(`Unexpected period list item ${index}`);
    }
    return parsePublicPeriod(
      { ...period, periodId: period.id },
      `list item ${index}`,
    );
  });
}

export async function updatePeriod(
  request: APIRequestContext,
  periodId: string,
  values: {
    readonly startDate: string;
    readonly endDate: string;
    readonly budgetYen: number;
  },
): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await request.put(
    `${getBaseUrl()}/api/periods/${encodeURIComponent(periodId)}`,
    { data: values },
  );
  return { status: response.status(), body: await response.json() };
}

export async function seedBoundaryPair(
  request: APIRequestContext,
  options: {
    readonly successorEndDate?: string;
    readonly successorDailyYen?: number;
  } = {},
): Promise<void> {
  await seedPeriod(request, getBaseUrl(), target);
  await seedPeriod(request, getBaseUrl(), {
    ...successor,
    endDate: options.successorEndDate ?? successor.endDate,
    dailyTotals:
      options.successorDailyYen == null
        ? undefined
        : [
            {
              date: successor.startDate,
              totalUsedYen: options.successorDailyYen,
            },
          ],
  });
}

export async function gotoTarget(page: Page): Promise<void> {
  await page.goto(`${getBaseUrl()}/?periodId=${target.periodId}`);
}

export async function applyRange(
  page: Page,
  values: { readonly startDate?: string; readonly endDate?: string },
): Promise<void> {
  const endDateInput = page.getByTestId("current-period-range-end");
  if (!(await endDateInput.isVisible())) {
    await page.getByText("期間の終了日や予算を変更する").click();
  }
  if (values.startDate != null) {
    await page.getByTestId("current-period-range-start").fill(values.startDate);
  }
  if (values.endDate != null) {
    await endDateInput.fill(values.endDate);
  }
  await page.getByTestId("current-period-range-apply").click();
}

export async function proposeBoundaryChange(page: Page): Promise<void> {
  await applyRange(page, { endDate: "2026-07-21" });
}

export async function assertExactDialog(page: Page): Promise<void> {
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
}

export async function assertUnchangedPair(request: APIRequestContext): Promise<{
  readonly target: PublicPeriod;
  readonly successor: PublicPeriod;
}> {
  const targetState = await readPeriod(request, target.periodId);
  const successorState = await readPeriod(request, successor.periodId);
  expect(targetState).toMatchObject(target);
  expect(successorState).toMatchObject({
    periodId: successor.periodId,
    startDate: successor.startDate,
    endDate: successor.endDate,
    budgetYen: successor.budgetYen,
  });
  return { target: targetState, successor: successorState };
}

export async function assertUpdatedPair(request: APIRequestContext): Promise<{
  readonly target: PublicPeriod;
  readonly successor: PublicPeriod;
}> {
  const targetState = await readPeriod(request, target.periodId);
  const successorState = await readPeriod(request, successor.periodId);
  expect(targetState).toMatchObject({ ...target, endDate: "2026-07-21" });
  expect(successorState).toMatchObject({
    periodId: successor.periodId,
    startDate: "2026-07-22",
    endDate: successor.endDate,
    budgetYen: successor.budgetYen,
  });
  return { target: targetState, successor: successorState };
}
