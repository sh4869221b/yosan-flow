import { describe, expect, it } from "vitest";
import {
  createPeriod,
  createPeriodSummaryRepository,
  runPeriodSummary,
} from "./helpers/period-summary";

describe("period summary food pace", () => {
  it("shows all saved pace surplus as today's bonus instead of spreading it over remaining days", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-bonus",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-bonus", {
      jstToday: "2026-04-06",
      dailyTotals: [
        {
          date: "2026-04-01",
          budgetPeriodId: "period-bonus",
          totalUsedYen: 1000,
        },
        {
          date: "2026-04-02",
          budgetPeriodId: "period-bonus",
          totalUsedYen: 1000,
        },
        {
          date: "2026-04-06",
          budgetPeriodId: "period-bonus",
          totalUsedYen: 800,
        },
      ],
    });

    expect(result.foodPace).toMatchObject({
      status: "bonus",
      baseDailyYen: 1500,
      todayBonusYen: 5500,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 7000,
      usedTodayYen: 800,
      todayRemainingYen: 6200,
    });
    expect(result.todayRecommendedYen).toBe(7000);
    expect(
      result.dailyRows.find((row) => row.date === "2026-04-07")?.recommendedYen,
    ).toBe(1500);
  });

  it("spreads only pace shortage across today and future days", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-shortage",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-shortage", {
      jstToday: "2026-04-06",
      dailyTotals: [
        {
          date: "2026-04-01",
          budgetPeriodId: "period-shortage",
          totalUsedYen: 5000,
        },
        {
          date: "2026-04-02",
          budgetPeriodId: "period-shortage",
          totalUsedYen: 4500,
        },
        {
          date: "2026-04-06",
          budgetPeriodId: "period-shortage",
          totalUsedYen: 800,
        },
      ],
    });

    expect(result.foodPace).toMatchObject({
      status: "adjustment",
      baseDailyYen: 1500,
      todayBonusYen: 0,
      adjustmentYen: 400,
      totalAdjustmentYen: 2000,
      todayAllowanceYen: 1100,
      usedTodayYen: 800,
      todayRemainingYen: 300,
    });
    expect(result.todayRecommendedYen).toBe(1100);
    expect(
      result.dailyRows.find((row) => row.date === "2026-04-07")?.recommendedYen,
    ).toBe(1100);
  });

  it("preserves shortage remainder across today and future recommendations", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-shortage-remainder",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      budgetYen: 3000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(
      repository,
      "period-shortage-remainder",
      {
        jstToday: "2026-04-02",
        dailyTotals: [
          {
            date: "2026-04-01",
            budgetPeriodId: "period-shortage-remainder",
            totalUsedYen: 101,
          },
        ],
      },
    );
    const futureRecommendations = result.dailyRows
      .filter((row) => row.date >= "2026-04-02")
      .map((row) => row.recommendedYen);

    expect(result.foodPace).toMatchObject({
      status: "adjustment",
      baseDailyYen: 100,
      adjustmentYen: 1,
      totalAdjustmentYen: 1,
      todayAllowanceYen: 99,
    });
    expect(futureRecommendations).toHaveLength(29);
    expect(
      futureRecommendations.reduce((total, value) => total + value, 0),
    ).toBe(2899);
    expect(
      result.dailyRows.find((row) => row.date === "2026-04-03")?.recommendedYen,
    ).toBe(100);
  });

  it("keeps today's bonus and adjustment stable when today's spending changes", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-stable-today",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const beforeTodayInput = await runPeriodSummary(
      repository,
      "period-stable-today",
      {
        jstToday: "2026-04-06",
        dailyTotals: [
          {
            date: "2026-04-01",
            budgetPeriodId: "period-stable-today",
            totalUsedYen: 1000,
          },
          {
            date: "2026-04-02",
            budgetPeriodId: "period-stable-today",
            totalUsedYen: 1000,
          },
        ],
      },
    );
    const afterTodayInput = await runPeriodSummary(
      repository,
      "period-stable-today",
      {
        jstToday: "2026-04-06",
        dailyTotals: [
          {
            date: "2026-04-01",
            budgetPeriodId: "period-stable-today",
            totalUsedYen: 1000,
          },
          {
            date: "2026-04-02",
            budgetPeriodId: "period-stable-today",
            totalUsedYen: 1000,
          },
          {
            date: "2026-04-06",
            budgetPeriodId: "period-stable-today",
            totalUsedYen: 800,
          },
        ],
      },
    );

    expect(afterTodayInput.foodPace.todayBonusYen).toBe(
      beforeTodayInput.foodPace.todayBonusYen,
    );
    expect(afterTodayInput.foodPace.adjustmentYen).toBe(
      beforeTodayInput.foodPace.adjustmentYen,
    );
    expect(afterTodayInput.foodPace.totalAdjustmentYen).toBe(
      beforeTodayInput.foodPace.totalAdjustmentYen,
    );
    expect(afterTodayInput.foodPace.baseDailyYen).toBe(
      beforeTodayInput.foodPace.baseDailyYen,
    );
    expect(afterTodayInput.foodPace.todayAllowanceYen).toBe(
      beforeTodayInput.foodPace.todayAllowanceYen,
    );
    expect(afterTodayInput.foodPace.todayRemainingYen).toBe(
      beforeTodayInput.foodPace.todayRemainingYen - 800,
    );
  });

  it("reflects previous day's spending in the next day's pace calculation", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-next-day",
      startDate: "2026-04-01",
      endDate: "2026-04-10",
      budgetYen: 15000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const dailyTotals = [
      {
        date: "2026-04-01",
        budgetPeriodId: "period-next-day",
        totalUsedYen: 1000,
      },
      {
        date: "2026-04-02",
        budgetPeriodId: "period-next-day",
        totalUsedYen: 1000,
      },
      {
        date: "2026-04-06",
        budgetPeriodId: "period-next-day",
        totalUsedYen: 800,
      },
    ];
    const today = await runPeriodSummary(repository, "period-next-day", {
      jstToday: "2026-04-06",
      dailyTotals,
    });
    const nextDay = await runPeriodSummary(repository, "period-next-day", {
      jstToday: "2026-04-07",
      dailyTotals,
    });

    expect(today.foodPace.todayBonusYen).toBe(5500);
    expect(nextDay.foodPace.todayBonusYen).toBe(6200);
    expect(nextDay.foodPace.todayRemainingYen).toBe(7700);
  });
});
