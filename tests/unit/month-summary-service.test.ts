import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { createInMemoryBudgetPeriodRepository } from "#lib/server/db/budget-period-repository.ts";
import { buildPeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";

describe("period summary service", () => {
  it("builds summary fields for selected period with full calendar range", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await Effect.runPromise(
      repository.createPeriod({
        id: "2026-04-main",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 120000,
        nowIso: "2026-04-01T00:00:00.000Z",
      }),
    );

    const result = await Effect.runPromise(
      buildPeriodSummary(repository, "2026-04-main", {
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
      }),
    );

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
      isRecorded: true,
      recommendedYen: expect.any(Number),
    });
    expect(result.dailyRows[result.dailyRows.length - 1].date).toBe(
      "2026-05-19",
    );
    expect(result.dailyRows).toHaveLength(30);
  });

  it("calculates today recommendation from spent before today only", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await Effect.runPromise(
      repository.createPeriod({
        id: "period-rule",
        startDate: "2026-04-18",
        endDate: "2026-04-20",
        budgetYen: 90,
        nowIso: "2026-04-01T00:00:00.000Z",
      }),
    );

    const result = await Effect.runPromise(
      buildPeriodSummary(repository, "period-rule", {
        jstToday: "2026-04-19",
        dailyTotals: [
          {
            date: "2026-04-18",
            budgetPeriodId: "period-rule",
            totalUsedYen: 30,
          },
          {
            date: "2026-04-20",
            budgetPeriodId: "period-rule",
            totalUsedYen: 60,
          },
        ],
      }),
    );

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

it("distinguishes zero totals from missing totals within the selected period", async () => {
  const repository = createInMemoryBudgetPeriodRepository();
  await Effect.runPromise(
    repository.createPeriod({
      id: "recorded-period",
      startDate: "2026-04-20",
      endDate: "2026-04-22",
      budgetYen: 1000,
      nowIso: "2026-04-01T00:00:00.000Z",
    }),
  );
  const summary = await Effect.runPromise(
    buildPeriodSummary(repository, "recorded-period", {
      jstToday: "2026-04-20",
      dailyTotals: [
        {
          date: "2026-04-20",
          budgetPeriodId: "recorded-period",
          totalUsedYen: 0,
        },
        {
          date: "2026-04-21",
          budgetPeriodId: "other-period",
          totalUsedYen: 100,
        },
        {
          date: "2026-04-22",
          budgetPeriodId: "recorded-period",
          totalUsedYen: 200,
        },
      ],
    }),
  );
  expect(
    summary.dailyRows.map(({ usedYen, isRecorded }) => ({
      usedYen,
      isRecorded,
    })),
  ).toEqual([
    { usedYen: 0, isRecorded: true },
    { usedYen: 0, isRecorded: false },
    { usedYen: 200, isRecorded: true },
  ]);
});
