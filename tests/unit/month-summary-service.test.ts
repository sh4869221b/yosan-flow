import { describe, expect, it } from "vitest";
import { createInMemoryMonthRepository } from "$lib/server/db/month-repository";
import { buildMonthSummary } from "$lib/server/services/month-summary-service";

describe("month summary service", () => {
  it("returns suggestedInitialBudgetYen when month record does not exist", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 120000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    const result = await buildMonthSummary(repository, "2026-04", {
      jstToday: "2026-04-18",
      dailyTotals: []
    });

    expect(result.monthStatus).toBe("uninitialized");
    expect(result.suggestedInitialBudgetYen).toBe(120000);
    expect(result.yearMonth).toBe("2026-04");
    expect(result.budgetYen).toBeNull();
    expect(result.daysRemaining).toBe(13);
    expect(result.dailyRows).toHaveLength(13);
  });

  it("builds full month summary fields", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-04",
      budgetYen: 120000,
      budgetStatus: "set",
      initializedFromPreviousMonth: true,
      carriedFromYearMonth: "2026-03",
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildMonthSummary(repository, "2026-04", {
      jstToday: "2026-04-18",
      dailyTotals: [
        { date: "2026-04-01", yearMonth: "2026-04", totalUsedYen: 10000 },
        { date: "2026-04-17", yearMonth: "2026-04", totalUsedYen: 2000 },
        { date: "2026-04-19", yearMonth: "2026-04", totalUsedYen: 5000 }
      ]
    });

    expect(result).toMatchObject({
      yearMonth: "2026-04",
      budgetYen: 120000,
      monthStatus: "ready",
      budgetStatus: "set",
      initializedFromPreviousMonth: true,
      carriedFromYearMonth: "2026-03",
      suggestedInitialBudgetYen: null,
      spentToDateYen: 12000,
      plannedTotalYen: 17000,
      remainingYen: 103000,
      overspentYen: 0,
      todayRecommendedYen: 7924,
      daysRemaining: 13
    });
    expect(result.dailyRows[0]).toEqual({
      date: "2026-04-18",
      label: "today",
      usedYen: 0,
      recommendedYen: 7924
    });
    expect(result.dailyRows[1]).toEqual({
      date: "2026-04-19",
      label: "planned",
      usedYen: 5000,
      recommendedYen: 7923
    });
  });

  it("shows zero recommendation when overspent", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-04",
      budgetYen: 10000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildMonthSummary(repository, "2026-04", {
      jstToday: "2026-04-18",
      dailyTotals: [{ date: "2026-04-18", yearMonth: "2026-04", totalUsedYen: 11000 }]
    });

    expect(result.remainingYen).toBe(-1000);
    expect(result.overspentYen).toBe(1000);
    expect(result.todayRecommendedYen).toBe(0);
    expect(result.dailyRows.every((row) => row.recommendedYen === 0)).toBe(true);
  });

  it("returns meaningful dailyRows for past month", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-04",
      budgetYen: 60000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildMonthSummary(repository, "2026-04", {
      jstToday: "2026-05-18",
      dailyTotals: [{ date: "2026-04-10", yearMonth: "2026-04", totalUsedYen: 2000 }]
    });

    expect(result.dailyRows).toHaveLength(30);
    expect(result.dailyRows[0].date).toBe("2026-04-01");
    expect(result.dailyRows[9]).toEqual({
      date: "2026-04-10",
      label: "planned",
      usedYen: 2000,
      recommendedYen: expect.any(Number)
    });
  });
});
