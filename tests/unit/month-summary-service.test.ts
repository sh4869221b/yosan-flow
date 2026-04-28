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
    expect(result.foodPace).toMatchObject({
      status: "on_track",
      baseDailyYen: 30,
      todayBonusYen: 0,
      adjustmentYen: 0,
      todayAllowanceYen: 30
    });
  });

  it("shows all saved pace surplus as today's bonus instead of spreading it over remaining days", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-bonus",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-bonus", {
      jstToday: "2026-04-06",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-bonus", totalUsedYen: 1000 },
        { date: "2026-04-02", budgetPeriodId: "period-bonus", totalUsedYen: 1000 },
        { date: "2026-04-06", budgetPeriodId: "period-bonus", totalUsedYen: 800 }
      ]
    });

    expect(result.foodPace).toMatchObject({
      status: "bonus",
      baseDailyYen: 1500,
      todayBonusYen: 5500,
      adjustmentYen: 0,
      todayAllowanceYen: 7000,
      usedTodayYen: 800,
      todayRemainingYen: 6200
    });
    expect(result.todayRecommendedYen).toBe(7000);
    expect(result.dailyRows.find((row) => row.date === "2026-04-07")?.recommendedYen).toBe(1500);
  });

  it("spreads only pace shortage across today and future days", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-shortage",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-shortage", {
      jstToday: "2026-04-06",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-shortage", totalUsedYen: 5000 },
        { date: "2026-04-02", budgetPeriodId: "period-shortage", totalUsedYen: 4500 },
        { date: "2026-04-06", budgetPeriodId: "period-shortage", totalUsedYen: 800 }
      ]
    });

    expect(result.foodPace).toMatchObject({
      status: "adjustment",
      baseDailyYen: 1500,
      todayBonusYen: 0,
      adjustmentYen: 400,
      todayAllowanceYen: 1100,
      usedTodayYen: 800,
      todayRemainingYen: 300
    });
    expect(result.todayRecommendedYen).toBe(1100);
    expect(result.dailyRows.find((row) => row.date === "2026-04-07")?.recommendedYen).toBe(1100);
  });

  it("preserves shortage remainder across today and future recommendations", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-shortage-remainder",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      budgetYen: 3000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-shortage-remainder", {
      jstToday: "2026-04-02",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-shortage-remainder", totalUsedYen: 101 }
      ]
    });
    const futureRecommendations = result.dailyRows
      .filter((row) => row.date >= "2026-04-02")
      .map((row) => row.recommendedYen);

    expect(result.foodPace).toMatchObject({
      status: "adjustment",
      baseDailyYen: 100,
      adjustmentYen: 1,
      todayAllowanceYen: 99
    });
    expect(futureRecommendations).toHaveLength(29);
    expect(futureRecommendations.reduce((total, value) => total + value, 0)).toBe(2899);
    expect(result.dailyRows.find((row) => row.date === "2026-04-03")?.recommendedYen).toBe(100);
  });

  it("does not show today's food pace before the selected period starts", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-future",
      startDate: "2026-04-10",
      endDate: "2026-04-19",
      budgetYen: 10001,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const result = await buildPeriodSummary(repository, "period-future", {
      jstToday: "2026-04-05"
    });

    expect(result.todayRecommendedYen).toBe(0);
    expect(result.dailyRows.some((row) => row.label === "today")).toBe(false);
    expect(result.dailyRows.reduce((total, row) => total + row.recommendedYen, 0)).toBe(10001);
    expect(result.foodPace).toMatchObject({
      status: "on_track",
      baseDailyYen: 1000,
      todayAllowanceYen: 0,
      usedTodayYen: 0,
      todayRemainingYen: 0,
      todayBonusYen: 0,
      adjustmentYen: 0
    });
  });

  it("keeps today's bonus and adjustment stable when today's spending changes", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-stable-today",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const beforeTodayInput = await buildPeriodSummary(repository, "period-stable-today", {
      jstToday: "2026-04-06",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-stable-today", totalUsedYen: 1000 },
        { date: "2026-04-02", budgetPeriodId: "period-stable-today", totalUsedYen: 1000 }
      ]
    });
    const afterTodayInput = await buildPeriodSummary(repository, "period-stable-today", {
      jstToday: "2026-04-06",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-stable-today", totalUsedYen: 1000 },
        { date: "2026-04-02", budgetPeriodId: "period-stable-today", totalUsedYen: 1000 },
        { date: "2026-04-06", budgetPeriodId: "period-stable-today", totalUsedYen: 800 }
      ]
    });

    expect(afterTodayInput.foodPace.todayBonusYen).toBe(beforeTodayInput.foodPace.todayBonusYen);
    expect(afterTodayInput.foodPace.adjustmentYen).toBe(beforeTodayInput.foodPace.adjustmentYen);
    expect(afterTodayInput.foodPace.todayRemainingYen).toBe(beforeTodayInput.foodPace.todayRemainingYen - 800);
  });

  it("reflects previous day's spending in the next day's pace calculation", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-next-day",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const today = await buildPeriodSummary(repository, "period-next-day", {
      jstToday: "2026-04-06",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-next-day", totalUsedYen: 1000 },
        { date: "2026-04-02", budgetPeriodId: "period-next-day", totalUsedYen: 1000 },
        { date: "2026-04-06", budgetPeriodId: "period-next-day", totalUsedYen: 800 }
      ]
    });
    const nextDay = await buildPeriodSummary(repository, "period-next-day", {
      jstToday: "2026-04-07",
      dailyTotals: [
        { date: "2026-04-01", budgetPeriodId: "period-next-day", totalUsedYen: 1000 },
        { date: "2026-04-02", budgetPeriodId: "period-next-day", totalUsedYen: 1000 },
        { date: "2026-04-06", budgetPeriodId: "period-next-day", totalUsedYen: 800 }
      ]
    });

    expect(today.foodPace.todayBonusYen).toBe(5500);
    expect(nextDay.foodPace.todayBonusYen).toBe(6200);
    expect(nextDay.foodPace.todayRemainingYen).toBe(7700);
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
