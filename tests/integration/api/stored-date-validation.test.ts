import { describe, expect, it } from "vitest";
import { createD1DailyTotalRepository } from "#lib/server/db/daily-total-repository.ts";
import { createD1DailyHistoryRepository } from "#lib/server/db/daily-history-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

describe("stored date input boundary", () => {
  it("reads only the period-owned columns required by summary calculations", async () => {
    const preparedSql: string[] = [];
    const repository = createD1DailyTotalRepository({
      db: createPeriodAwareD1Fake(preparedSql, {
        totalDates: { p: ["2026-04-02", "2026-04-01"], other: ["2026-04-01"] },
      }),
    });

    await expect(runApiEffect(repository.listByPeriodId("p"))).resolves.toEqual(
      [
        { date: "2026-04-01", budgetPeriodId: "p", totalUsedYen: 1 },
        { date: "2026-04-02", budgetPeriodId: "p", totalUsedYen: 1 },
      ],
    );
    expect(preparedSql).toHaveLength(1);
    expect(preparedSql[0]).not.toMatch(/year_month|updated_at/);
  });

  it("rejects a malformed stored total before it reaches summary calculations", async () => {
    const repository = createD1DailyTotalRepository({
      db: createPeriodAwareD1Fake([], { totalDates: { p: ["2026-04-31"] } }),
    });
    await expect(runApiEffect(repository.listByPeriodId("p"))).rejects.toThrow(
      "Invalid date: 2026-04-31",
    );
  });

  it("rejects malformed stored history dates on materialization", async () => {
    const repository = createD1DailyHistoryRepository({
      db: createPeriodAwareD1Fake([], { historyDates: { p: ["2026-04-31"] } }),
    });
    await expect(
      runApiEffect(repository.listHistoriesByDate("2026-04-31", "p")),
    ).rejects.toThrow("Invalid date: 2026-04-31");
  });
});
