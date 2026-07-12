import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { seedPeriod } from "./helpers/db";
import {
  addDays,
  fetchPeriodSummary,
  getBaseUrl,
  getCurrentJstDate,
  resetTestData,
  warmUpBrowser,
} from "./dashboard-shared";

export type SeededDayEntryPeriod = {
  readonly periodId: string;
  readonly todayDate: string;
};

export type SuccessfulDayEntrySaveOptions = {
  readonly page: Page;
  readonly modal: Locator;
  readonly periodId: string;
  readonly date: string;
  readonly responseAssertionContext?: string;
};

export class SuccessfulDayEntrySaveError extends Error {
  readonly status: number;
  readonly url: string;
  readonly context: string | undefined;

  constructor(status: number, url: string, context?: string) {
    const contextSuffix = context === undefined ? "" : ` (${context})`;
    super(`Day-entry add failed with HTTP ${status}${contextSuffix}: ${url}`);
    this.name = new.target.name;
    this.status = status;
    this.url = url;
    this.context = context;
  }
}

export function configureDashboardDayEntryE2E(): void {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeEach(async ({ browser, request }) => {
    await resetTestData(request);
    await warmUpBrowser(browser);
  });
}

export async function seedCurrentPeriod(
  request: APIRequestContext,
): Promise<SeededDayEntryPeriod> {
  const startDate = getCurrentJstDate();
  const periodId = `p-${startDate}`;
  await seedPeriod(request, getBaseUrl(), {
    periodId,
    startDate,
    endDate: addDays(startDate, 29),
    budgetYen: 120000,
  });

  const summary = await fetchPeriodSummary(request, periodId);
  const todayRow = summary.dailyRows.find((row) => row.label === "today");
  expect(todayRow).toBeDefined();

  return {
    periodId,
    todayDate: todayRow?.date ?? startDate,
  };
}

export function isExactDayEntryAddResponse(
  response: Response,
  expectedUrl: string,
): boolean {
  return (
    response.request().method() === "POST" && response.url() === expectedUrl
  );
}

export async function saveDayEntrySuccessfully({
  page,
  modal,
  periodId,
  date,
  responseAssertionContext,
}: SuccessfulDayEntrySaveOptions): Promise<void> {
  const addPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/add`;
  const expectedUrl = new URL(addPath, page.url()).href;
  const [response] = await Promise.all([
    page.waitForResponse((candidate) =>
      isExactDayEntryAddResponse(candidate, expectedUrl),
    ),
    modal.getByRole("button", { name: "保存する" }).click(),
  ]);

  if (!response.ok()) {
    throw new SuccessfulDayEntrySaveError(
      response.status(),
      response.url(),
      responseAssertionContext,
    );
  }

  await expect(modal).toBeHidden();
}
