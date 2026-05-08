import type { APIRequestContext } from "@playwright/test";

type DailySeed = {
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

async function requestJson(
  request: APIRequestContext,
  baseUrl: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<{
  status: number;
  json: any;
}> {
  const response = await request.fetch(
    new URL(path, `${baseUrl}/`).toString(),
    {
      method,
      headers:
        body == null ? undefined : { "content-type": "application/json" },
      data: body,
    },
  );
  const json = await response.json().catch(() => ({}));
  return {
    status: response.status(),
    json,
  };
}

export async function seedPeriod(
  request: APIRequestContext,
  baseUrl: string,
  input: SeedPeriodInput,
): Promise<void> {
  const createResponse = await requestJson(
    request,
    baseUrl,
    "POST",
    "/api/periods",
    {
      id: input.periodId,
      startDate: input.startDate,
      endDate: input.endDate,
      budgetYen: input.budgetYen,
    },
  );
  if (createResponse.status !== 201) {
    throw new Error(
      `seedPeriod create request failed: ${createResponse.status}`,
    );
  }

  for (const row of input.dailyTotals ?? []) {
    const dayResponse = await requestJson(
      request,
      baseUrl,
      "POST",
      `/api/periods/${encodeURIComponent(input.periodId)}/days/${encodeURIComponent(row.date)}/add`,
      {
        inputYen: row.totalUsedYen,
      },
    );
    if (dayResponse.status !== 200) {
      throw new Error(`seedPeriod day add failed: ${dayResponse.status}`);
    }
  }
}
