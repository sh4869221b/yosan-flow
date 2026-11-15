import { describe, expect, it } from "vitest";
import { toBudgetPeriodRecord } from "#lib/server/db/budget-period-row-mapper.ts";
import { createInMemoryBudgetPeriodRepository } from "#lib/server/db/budget-period-in-memory-repository.ts";

const row = {
  id: "p",
  start_date: "2026-04-20",
  end_date: "2026-05-19",
  budget_yen: 1000,
  status: "active" as const,
  predecessor_period_id: null,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

describe("stored period input boundary", () => {
  it.each([
    { start_date: "2026-02-30" },
    { end_date: "invalid" },
    { start_date: "2026-06-01" },
    { budget_yen: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed D1 data: %j", (invalid) => {
    expect(() => toBudgetPeriodRecord({ ...row, ...invalid })).toThrow();
  });

  it("validates records supplied when an in-memory store is initialized", () => {
    const record = toBudgetPeriodRecord(row);
    expect(() =>
      createInMemoryBudgetPeriodRepository([
        { ...record, startDate: "2026-02-30" },
      ]),
    ).toThrow();
  });
});
