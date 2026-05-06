import type { APIRequestContext, Browser } from "@playwright/test";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4173;
const E2E_RESET_TOKEN = "local-e2e-reset-token";

const baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

export function getBaseUrl(): string {
  return baseUrl;
}

export function getCurrentJstDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "04";
  const day = parts.find((part) => part.type === "day")?.value ?? "20";
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const dateValue = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(dateValue + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function warmUpBrowser(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseUrl}/`);
    await page.waitForTimeout(500);
  } finally {
    await page.close();
  }
}

export async function resetTestData(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${baseUrl}/api/__test/reset`, {
    headers: {
      "x-yosan-flow-e2e-reset-token": E2E_RESET_TOKEN,
    },
  });
  if (!response.ok()) {
    throw new Error(`Failed to reset test data: ${response.status()}`);
  }
}

export async function fetchPeriods(request: APIRequestContext) {
  const response = await request.get(`${baseUrl}/api/periods`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch periods: ${response.status()}`);
  }
  const body = await response.json();
  return body.periods as Array<{
    id: string;
    startDate: string;
    endDate: string;
  }>;
}

export async function fetchPeriodSummary(
  request: APIRequestContext,
  periodId: string,
) {
  const response = await request.get(
    `${baseUrl}/api/periods/${encodeURIComponent(periodId)}`,
  );
  if (!response.ok()) {
    throw new Error(
      `Failed to fetch period summary for ${periodId}: ${response.status()}`,
    );
  }
  return (await response.json()) as {
    periodId: string;
    dailyRows: Array<{ date: string; label: "today" | "planned" }>;
  };
}
