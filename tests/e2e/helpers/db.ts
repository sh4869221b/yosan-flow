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
  predecessorPeriodId?: string;
  dailyTotals?: DailySeed[];
};

export async function seedPeriod(
  request: APIRequestContext,
  baseUrl: string,
  input: SeedPeriodInput,
): Promise<void> {
  const createResponse = await request.post(
    new URL("/api/periods", `${baseUrl}/`).toString(),
    {
      data: {
        id: input.periodId,
        startDate: input.startDate,
        endDate: input.endDate,
        budgetYen: input.budgetYen,
        predecessorPeriodId: input.predecessorPeriodId,
      },
    },
  );
  if (createResponse.status() !== 201) {
    throw new Error(
      `seedPeriod create request failed: ${createResponse.status()}`,
    );
  }

  for (const row of input.dailyTotals ?? []) {
    const dayResponse = await request.post(
      new URL(
        `/api/periods/${encodeURIComponent(input.periodId)}/days/${encodeURIComponent(row.date)}/add`,
        `${baseUrl}/`,
      ).toString(),
      { data: { inputYen: row.totalUsedYen } },
    );
    if (dayResponse.status() !== 200) {
      throw new Error(`seedPeriod day add failed: ${dayResponse.status()}`);
    }
  }
}
