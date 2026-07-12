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

export type DayEntrySaveResponseOptions = {
  readonly page: Page;
  readonly modal: Locator;
  readonly periodId: string;
  readonly date: string;
};

export type OpenDayEntryAndWaitForHistoryOptions = {
  readonly page: Page;
  readonly periodId: string;
  readonly date: string;
};

export type SuccessfulDayEntrySaveOptions = DayEntrySaveResponseOptions & {
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

export async function openDayEntryAndWaitForHistory({
  page,
  periodId,
  date,
}: OpenDayEntryAndWaitForHistoryOptions): Promise<Locator> {
  const dayTestId = `calendar-day-${date}`;
  const dayButton = page.getByTestId(dayTestId);
  await page.waitForFunction((testId) => {
    const element = document.querySelector(`[data-testid="${testId}"]`);
    return (
      element != null &&
      Object.getOwnPropertySymbols(element).some(
        (symbol) => symbol.description === "events",
      )
    );
  }, dayTestId);

  const historyPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history`;
  const expectedUrl = new URL(historyPath, page.url()).href;
  const historyResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "GET" && candidate.url() === expectedUrl,
  );
  await dayButton.click();

  const modal = page.getByTestId("day-entry-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(`対象日: ${date}`);
  const response = await historyResponse;
  expect(
    response.ok(),
    `Initial day-entry history request failed with HTTP ${response.status()}: ${response.url()}`,
  ).toBe(true);
  await expect(modal.getByText("履歴を読み込み中...")).toBeHidden();
  await expect(
    modal.getByText("入力を保存すると履歴が表示されます。"),
  ).toBeVisible();
  return modal;
}

export async function clickSaveAndWaitForDayEntryAddResponse({
  page,
  modal,
  periodId,
  date,
}: DayEntrySaveResponseOptions): Promise<Response> {
  const addPath = `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/add`;
  const expectedUrl = new URL(addPath, page.url()).href;
  const [response] = await Promise.all([
    page.waitForResponse((candidate) =>
      isExactDayEntryAddResponse(candidate, expectedUrl),
    ),
    modal.getByRole("button", { name: "保存する" }).click(),
  ]);
  return response;
}

export async function saveDayEntrySuccessfully({
  page,
  modal,
  periodId,
  date,
  responseAssertionContext,
}: SuccessfulDayEntrySaveOptions): Promise<void> {
  const response = await clickSaveAndWaitForDayEntryAddResponse({
    page,
    modal,
    periodId,
    date,
  });

  if (!response.ok()) {
    throw new SuccessfulDayEntrySaveError(
      response.status(),
      response.url(),
      responseAssertionContext,
    );
  }

  await expect(modal).toBeHidden();
}
