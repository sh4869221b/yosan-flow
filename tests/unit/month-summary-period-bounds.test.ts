import { describe, expect, it } from "vitest";
import {
  createPeriod,
  createPeriodSummaryRepository,
  runPeriodSummary,
} from "./helpers/period-summary";

describe("period summary period bounds", () => {
  it("does not show today's food pace before the selected period starts", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-future",
      startDate: "2026-04-10",
      endDate: "2026-04-19",
      budgetYen: 10001,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-future", {
      jstToday: "2026-04-05",
    });

    expect(result.todayRecommendedYen).toBe(0);
    expect(result.dailyRows.some((row) => row.label === "today")).toBe(false);
    expect(
      result.dailyRows.reduce((total, row) => total + row.recommendedYen, 0),
    ).toBe(10001);
    expect(result.foodPace).toMatchObject({
      status: "on_track",
      baseDailyYen: 1000,
      todayAllowanceYen: 0,
      usedTodayYen: 0,
      todayRemainingYen: 0,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
    });
  });

  it("shows zero recommendation when overspent", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-overspent",
      startDate: "2026-04-18",
      endDate: "2026-04-22",
      budgetYen: 10000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-overspent", {
      jstToday: "2026-04-20",
      dailyTotals: [
        {
          date: "2026-04-18",
          budgetPeriodId: "period-overspent",
          totalUsedYen: 11000,
        },
      ],
    });

    expect(result.remainingYen).toBe(-1000);
    expect(result.overspentYen).toBe(1000);
    expect(result.todayRecommendedYen).toBe(0);
    expect(result.dailyRows.every((row) => row.recommendedYen === 0)).toBe(
      true,
    );
  });

  it("ignores out-of-range daily totals when period bounds are narrower", async () => {
    const repository = createPeriodSummaryRepository();
    await createPeriod(repository, {
      id: "period-shrink",
      startDate: "2026-04-20",
      endDate: "2026-04-22",
      budgetYen: 10000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });

    const result = await runPeriodSummary(repository, "period-shrink", {
      jstToday: "2026-04-20",
      dailyTotals: [
        {
          date: "2026-04-19",
          budgetPeriodId: "period-shrink",
          totalUsedYen: 9999,
        },
        {
          date: "2026-04-20",
          budgetPeriodId: "period-shrink",
          totalUsedYen: 1000,
        },
        {
          date: "2026-04-20",
          budgetPeriodId: "other-period",
          totalUsedYen: 5000,
        },
        {
          date: "2026-04-23",
          budgetPeriodId: "period-shrink",
          totalUsedYen: 9999,
        },
      ],
    });

    expect(result.plannedTotalYen).toBe(1000);
    expect(result.spentToDateYen).toBe(1000);
  });
});
