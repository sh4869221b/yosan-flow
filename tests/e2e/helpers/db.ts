import { expect, type APIRequestContext } from "@playwright/test";

export type DailySeed = {
  date: string;
  totalUsedYen: number;
};

export type SeedMonthInput = {
  yearMonth: string;
  budgetYen: number;
  dailyTotals?: DailySeed[];
};

export type SeedHistoryEntry = {
  operation: "add" | "overwrite";
  inputYen: number;
  memo?: string;
};

async function requestJson(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<{
  status: number;
  json: any;
}> {
  const response = await request.fetch(path, {
    method,
    headers: body == null ? undefined : { "content-type": "application/json" },
    data: body
  });
  const json = await response.json().catch(() => ({}));
  return {
    status: response.status(),
    json
  };
}

export async function resetDatabase(
  request: APIRequestContext,
  input: { yearMonth: string; budgetYen?: number; dates?: string[] } = { yearMonth: "2026-04" }
): Promise<void> {
  const budgetYen = input.budgetYen ?? 0;
  const response = await requestJson(
    request,
    "PUT",
    `/api/months/${input.yearMonth}/budget`,
    { budgetYen }
  );
  expect(response.status).toBe(200);

  for (const date of input.dates ?? []) {
    const resetDayResponse = await requestJson(request, "PUT", `/api/days/${date}/overwrite`, {
      yearMonth: input.yearMonth,
      inputYen: 0
    });
    expect(resetDayResponse.status).toBe(200);
  }
}

export async function seedMonth(
  request: APIRequestContext,
  input: SeedMonthInput
): Promise<void> {
  const budgetResponse = await requestJson(
    request,
    "PUT",
    `/api/months/${input.yearMonth}/budget`,
    { budgetYen: input.budgetYen }
  );
  expect(budgetResponse.status).toBe(200);

  for (const row of input.dailyTotals ?? []) {
    const dayResponse = await requestJson(request, "PUT", `/api/days/${row.date}/overwrite`, {
      yearMonth: input.yearMonth,
      inputYen: row.totalUsedYen
    });
    expect(dayResponse.status).toBe(200);
  }
}

export async function seedHistory(
  request: APIRequestContext,
  input: { date: string; yearMonth: string; entries: SeedHistoryEntry[] }
): Promise<void> {
  for (const entry of input.entries) {
    const method = entry.operation === "add" ? "POST" : "PUT";
    const path =
      entry.operation === "add"
        ? `/api/days/${input.date}/add`
        : `/api/days/${input.date}/overwrite`;
    const response = await requestJson(request, method, path, {
      yearMonth: input.yearMonth,
      inputYen: entry.inputYen,
      memo: entry.memo
    });
    expect(response.status).toBe(200);
  }
}
