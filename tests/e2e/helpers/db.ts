import type { APIRequestContext } from "@playwright/test";

export type DailySeed = {
  date: string;
  totalUsedYen: number;
};

export type SeedPeriodInput = {
  periodId: string;
  startDate: string;
  endDate: string;
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

export async function seedPeriod(
  request: APIRequestContext,
  baseUrl: string,
  input: SeedPeriodInput
): Promise<void> {
  const createResponse = await requestJson(request, baseUrl, "POST", "/api/periods", {
    id: input.periodId,
    startDate: input.startDate,
    endDate: input.endDate,
    budgetYen: input.budgetYen
  });
  if (createResponse.status !== 201) {
    throw new Error(`seedPeriod create request failed: ${createResponse.status}`);
  }

  for (const row of input.dailyTotals ?? []) {
    const dayResponse = await requestJson(
      request,
      baseUrl,
      "POST",
      `/api/periods/${encodeURIComponent(input.periodId)}/days/${encodeURIComponent(row.date)}/add`,
      {
        inputYen: row.totalUsedYen
      }
    );
    if (dayResponse.status !== 200) {
      throw new Error(`seedPeriod day add failed: ${dayResponse.status}`);
    }
  }
}

export async function seedHistory(
  request: APIRequestContext,
  baseUrl: string,
  input: { periodId: string; date: string; entries: SeedHistoryEntry[] }
): Promise<void> {
  for (const entry of input.entries) {
    const method = entry.operation === "add" ? "POST" : "PUT";
    const path =
      entry.operation === "add"
        ? `/api/periods/${encodeURIComponent(input.periodId)}/days/${encodeURIComponent(input.date)}/add`
        : `/api/periods/${encodeURIComponent(input.periodId)}/days/${encodeURIComponent(input.date)}/overwrite`;
    const response = await requestJson(request, baseUrl, method, path, {
      inputYen: entry.inputYen,
      memo: entry.memo
    });
    if (response.status !== 200) {
      throw new Error(`seedHistory request failed: ${response.status}`);
    }
  }
}
