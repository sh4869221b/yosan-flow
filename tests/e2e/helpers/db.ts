import type { APIRequestContext } from "@playwright/test";

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
  baseUrl: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<{
  status: number;
  json: any;
}> {
  const response = await request.fetch(new URL(path, `${baseUrl}/`).toString(), {
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
  baseUrl: string,
  input: { yearMonth: string; budgetYen?: number; dates?: string[] } = { yearMonth: "2026-04" }
): Promise<void> {
  const budgetYen = input.budgetYen ?? 0;
  const response = await requestJson(
    request,
    baseUrl,
    "PUT",
    `/api/months/${input.yearMonth}/budget`,
    { budgetYen }
  );
  if (response.status !== 200) {
    throw new Error(`resetDatabase budget request failed: ${response.status}`);
  }

  for (const date of input.dates ?? []) {
    const resetDayResponse = await requestJson(
      request,
      baseUrl,
      "PUT",
      `/api/days/${date}/overwrite`,
      {
        yearMonth: input.yearMonth,
        inputYen: 0
      }
    );
    if (resetDayResponse.status !== 200) {
      throw new Error(`resetDatabase day overwrite failed: ${resetDayResponse.status}`);
    }
  }
}

export async function seedMonth(
  request: APIRequestContext,
  baseUrl: string,
  input: SeedMonthInput
): Promise<void> {
  const budgetResponse = await requestJson(
    request,
    baseUrl,
    "PUT",
    `/api/months/${input.yearMonth}/budget`,
    { budgetYen: input.budgetYen }
  );
  if (budgetResponse.status !== 200) {
    throw new Error(`seedMonth budget request failed: ${budgetResponse.status}`);
  }

  for (const row of input.dailyTotals ?? []) {
    const dayResponse = await requestJson(
      request,
      baseUrl,
      "POST",
      `/api/days/${row.date}/add`,
      {
        yearMonth: input.yearMonth,
        inputYen: row.totalUsedYen
      }
    );
    if (dayResponse.status !== 200) {
      throw new Error(`seedMonth day overwrite failed: ${dayResponse.status}`);
    }
  }
}

export async function seedHistory(
  request: APIRequestContext,
  baseUrl: string,
  input: { date: string; yearMonth: string; entries: SeedHistoryEntry[] }
): Promise<void> {
  for (const entry of input.entries) {
    const method = entry.operation === "add" ? "POST" : "PUT";
    const path =
      entry.operation === "add"
        ? `/api/days/${input.date}/add`
        : `/api/days/${input.date}/overwrite`;
    const response = await requestJson(request, baseUrl, method, path, {
      yearMonth: input.yearMonth,
      inputYen: entry.inputYen,
      memo: entry.memo
    });
    if (response.status !== 200) {
      throw new Error(`seedHistory request failed: ${response.status}`);
    }
  }
}
