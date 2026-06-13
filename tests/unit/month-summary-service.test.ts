import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  createPeriod,
  createPeriodSummaryRepository,
  runPeriodSummary,
} from "./helpers/period-summary";
import { buildPeriodSummary as buildPeriodSummaryFromCalculator } from "$lib/server/services/period-summary/period-summary-calculator";

describe("period summary service", () => {
  it("exposes the period summary calculator from the focused module", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-calculator-module",
      startDate: "2026-04-20",
      endDate: "2026-04-22",
      budgetYen: 9000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await Effect.runPromise(
      buildPeriodSummaryFromCalculator(repository, "period-calculator-module", {
        jstToday: "2026-04-21",
        dailyTotals: [
          {
            date: "2026-04-20",
            budgetPeriodId: "period-calculator-module",
            totalUsedYen: 3000,
          },
        ],
      }),
    );

    expect(result.periodId).toBe("period-calculator-module");
    expect(result.todayRecommendedYen).toBe(3000);
  });

  it("builds summary fields for selected period with full calendar range", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "2026-04-main",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 120000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "2026-04-main", {
      jstToday: "2026-04-20",
      dailyTotals: [
        {
          date: "2026-04-20",
          budgetPeriodId: "2026-04-main",
          totalUsedYen: 10000,
        },
        {
          date: "2026-04-21",
          budgetPeriodId: "2026-04-main",
          totalUsedYen: 2000,
        },
        {
          date: "2026-05-19",
          budgetPeriodId: "2026-04-main",
          totalUsedYen: 5000,
        },
      ],
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
      daysRemaining: 30,
    });
    expect(result.dailyRows[0]).toEqual({
      date: "2026-04-20",
      label: "today",
      usedYen: 10000,
      recommendedYen: expect.any(Number),
    });
    expect(result.dailyRows[result.dailyRows.length - 1].date).toBe(
      "2026-05-19",
    );
    expect(result.dailyRows).toHaveLength(30);
  });

  it("calculates today recommendation from spent before today only", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-rule",
      startDate: "2026-04-18",
      endDate: "2026-04-20",
      budgetYen: 90,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-rule", {
      jstToday: "2026-04-19",
      dailyTotals: [
        { date: "2026-04-18", budgetPeriodId: "period-rule", totalUsedYen: 30 },
        { date: "2026-04-20", budgetPeriodId: "period-rule", totalUsedYen: 60 },
      ],
    });

    expect(result.todayRecommendedYen).toBe(30);
    expect(result.varianceFromRecommendationYen).toBe(-30);
    expect(result.remainingAfterDayYenPreview).toBe(60);
    expect(result.foodPace).toMatchObject({
      status: "on_track",
      baseDailyYen: 30,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 30,
    });
  });
});
