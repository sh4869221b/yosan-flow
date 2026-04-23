import { describe, expect, it } from "vitest";
import { createInMemoryBudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import { buildPeriodSummary } from "$lib/server/services/month-summary-service";

describe("period summary service", () => {
  it("builds summary fields for selected period with full calendar range", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "2026-04-main",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 120000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "2026-04-main", {
      jstToday: "2026-04-20",
      dailyTotals: [
        { date: "2026-04-20", budgetPeriodId: "2026-04-main", totalUsedYen: 10000 },
        { date: "2026-04-21", budgetPeriodId: "2026-04-main", totalUsedYen: 2000 },
        { date: "2026-05-19", budgetPeriodId: "2026-04-main", totalUsedYen: 5000 }
      ]
    });

    expect(result).toMatchObject({
      periodId: "2026-04-main",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 120000,
      status: "active",
      periodLengthDays: 30,
      spentToDateYen: 10000,
      plannedTotalYen: 17000,
      remainingYen: 103000,
      overspentYen: 0,
      varianceFromRecommendationYen: expect.any(Number),
      remainingAfterDayYenPreview: expect.any(Number),
      daysRemaining: 30
    });
    expect(result.dailyRows[0]).toEqual({
      date: "2026-04-20",
      label: "today",
      usedYen: 10000,
      recommendedYen: expect.any(Number)
    });
    expect(result.dailyRows[result.dailyRows.length - 1].date).toBe("2026-05-19");
    expect(result.dailyRows).toHaveLength(30);
  });

  it("calculates today recommendation from spent before today only", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-rule",
      startDate: "2026-04-18",
      endDate: "2026-04-20",
      budgetYen: 90,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-rule", {
      jstToday: "2026-04-19",
      dailyTotals: [
        { date: "2026-04-18", budgetPeriodId: "period-rule", totalUsedYen: 30 },
        { date: "2026-04-20", budgetPeriodId: "period-rule", totalUsedYen: 60 }
      ]
    });

    expect(result.todayRecommendedYen).toBe(30);
    expect(result.varianceFromRecommendationYen).toBe(-30);
    expect(result.remainingAfterDayYenPreview).toBe(60);
  });

  it("shows zero recommendation when overspent", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-overspent",
      startDate: "2026-04-18",
      endDate: "2026-04-22",
      budgetYen: 10000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-overspent", {
      jstToday: "2026-04-20",
      dailyTotals: [{ date: "2026-04-18", budgetPeriodId: "period-overspent", totalUsedYen: 11000 }]
    });

    expect(result.remainingYen).toBe(-1000);
    expect(result.overspentYen).toBe(1000);
    expect(result.todayRecommendedYen).toBe(0);
    expect(result.dailyRows.every((row) => row.recommendedYen === 0)).toBe(true);
  });

  it("ignores out-of-range daily totals when period bounds are narrower", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-shrink",
      startDate: "2026-04-20",
      endDate: "2026-04-22",
      budgetYen: 10000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-shrink", {
      jstToday: "2026-04-20",
      dailyTotals: [
        { date: "2026-04-19", budgetPeriodId: "period-shrink", totalUsedYen: 9999 },
        { date: "2026-04-20", budgetPeriodId: "period-shrink", totalUsedYen: 1000 },
        { date: "2026-04-23", budgetPeriodId: "period-shrink", totalUsedYen: 9999 }
      ]
    });

    expect(result.plannedTotalYen).toBe(1000);
    expect(result.spentToDateYen).toBe(1000);
  });
});
