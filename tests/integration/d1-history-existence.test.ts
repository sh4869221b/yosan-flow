import { describe, expect, it } from "vitest";
import { createD1DailyHistoryRepository } from "#lib/server/db/daily-history-d1-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createD1ApiServices } from "#lib/server/services/api-services/d1.ts";
import { createPeriodAwareD1Fake } from "./helpers/period-d1-fake";

describe("D1 history existence lookup", () => {
  it("selects only the scoped ID with a single-row limit and no sorting", async () => {
    const statements: string[] = [];
    const repository = createD1DailyHistoryRepository({
      db: createPeriodAwareD1Fake(statements, {
        historyDates: { first: ["2026-05-01"], second: ["2026-05-01"] },
      }),
    });
    const target = {
      budgetPeriodId: "first",
      date: "2026-05-01",
      historyId: "seed-history-first-2026-05-01",
    };
    await expect(runApiEffect(repository.hasHistoryById(target))).resolves.toBe(
      true,
    );
    for (const input of [
      { ...target, historyId: "missing" },
      { ...target, budgetPeriodId: "second" },
      { ...target, date: "2026-05-02" },
    ]) {
      await expect(
        runApiEffect(repository.hasHistoryById(input)),
      ).resolves.toBe(false);
    }
    expect(statements).toHaveLength(4);
    for (const sql of statements) {
      expect(sql).toMatch(/^select "id" from "daily_operation_histories"/);
      expect(sql).toContain(
        '"daily_operation_histories"."budget_period_id" = ?',
      );
      expect(sql).toContain('"daily_operation_histories"."date" = ?');
      expect(sql).toContain('"daily_operation_histories"."id" = ?');
      expect(sql).toContain("limit ?");
      expect(sql).not.toContain("order by");
    }
  });

  it.each(["updateHistoryEntry", "deleteHistoryEntry"] as const)(
    "%s rejects a missing or differently owned ID without replaying",
    async (method) => {
      const statements: string[] = [];
      const services = createD1ApiServices(
        createPeriodAwareD1Fake(statements),
        {
          now: () => new Date("2026-05-01T00:00:00.000Z"),
          createHistoryId: () => "target",
        },
      );
      await runApiEffect(
        services.createPeriod({
          id: "first",
          startDate: "2026-05-01",
          endDate: "2026-05-03",
          budgetYen: 1000,
        }),
      );
      await runApiEffect(
        services.createPeriod({
          id: "second",
          startDate: "2026-05-04",
          endDate: "2026-05-06",
          budgetYen: 1000,
        }),
      );
      await runApiEffect(
        services.dayEntryService.addDailyAmount({
          periodId: "first",
          date: "2026-05-01",
          inputYen: 100,
        }),
      );
      for (const command of [
        { periodId: "first", date: "2026-05-01", historyId: "missing" },
        { periodId: "first", date: "2026-05-02", historyId: "target" },
        { periodId: "second", date: "2026-05-04", historyId: "target" },
      ]) {
        statements.length = 0;
        await expect(
          runApiEffect(
            services.dayEntryService[method]({
              ...command,
              inputYen: 200,
            }),
          ),
        ).rejects.toMatchObject({ code: "HISTORY_NOT_FOUND" });
        const historySql = statements.filter((sql) =>
          sql.includes("daily_operation_histories"),
        );
        expect(historySql).toHaveLength(1);
        expect(historySql[0]).toMatch(/^select "id" from/);
      }
      await expect(
        runApiEffect(services.listDailyTotalsByPeriodId("first")),
      ).resolves.toEqual([
        { budgetPeriodId: "first", date: "2026-05-01", totalUsedYen: 100 },
      ]);
    },
  );
});
