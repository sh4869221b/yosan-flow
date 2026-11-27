import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDateRange,
  mapDateRange,
} from "#lib/server/services/period-summary/date-range.ts";
import { calculatePeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";

afterEach(() => vi.restoreAllMocks());

function listDates(start: string, end: string): string[] {
  return mapDateRange(getDateRange(start, end), (date) => date);
}

describe("period summary date ranges", () => {
  it.each([
    ["9999-12-31", "9999-12-31", ["9999-12-31"]],
    ["9999-12-30", "9999-12-31", ["9999-12-30", "9999-12-31"]],
  ])(
    "terminates at the last supported date from %s",
    (start, end, expected) => {
      const parse = Date.parse;
      let parses = 0;
      // Bound the old string-cursor loop too, so a regression fails instead of hanging.
      vi.spyOn(Date, "parse").mockImplementation((value) => {
        if (++parses > 10) throw new Error("date range did not terminate");
        return parse(value);
      });
      expect(listDates(start, end)).toEqual(expected);
    },
  );

  it.each([
    ["2028-02-28", "2028-03-01", ["2028-02-28", "2028-02-29", "2028-03-01"]],
    ["2027-12-31", "2028-01-01", ["2027-12-31", "2028-01-01"]],
    ["2028-03-01", "2028-02-28", []],
    ["2027-02-29", "2027-03-01", ["2027-03-01"]],
    ["2028-00-28", "2028-03-01", []],
  ])("returns inclusive days from %s through %s", (start, end, expected) => {
    expect(listDates(start, end)).toEqual(expected);
  });

  const period = {
    id: "leap-period",
    startDate: "2028-02-28",
    endDate: "2028-03-01",
    budgetYen: 3000,
    status: "active" as const,
    predecessorPeriodId: null,
    createdAt: "2028-02-01T00:00:00.000Z",
    updatedAt: "2028-02-01T00:00:00.000Z",
  };

  it.each([
    ["2028-02-27", 3, [1000, 1000, 1000], 0],
    ["2028-02-28", 3, [1000, 1000, 1000], 1000],
    ["2028-02-29", 2, [0, 2000, 1000], 2000],
    ["2028-03-01", 1, [0, 0, 3000], 3000],
    ["2028-03-02", 0, [0, 0, 0], 0],
  ])(
    "preserves remaining days and recommendations on %s",
    (today, days, recommendations, allowance) => {
      const summary = calculatePeriodSummary(period, { jstToday: today });
      expect(summary.periodLengthDays).toBe(3);
      expect(summary.daysRemaining).toBe(days);
      expect(summary.dailyRows.map((row) => row.date)).toEqual([
        "2028-02-28",
        "2028-02-29",
        "2028-03-01",
      ]);
      expect(summary.dailyRows.map((row) => row.recommendedYen)).toEqual(
        recommendations,
      );
      expect(summary.foodPace.todayAllowanceYen).toBe(allowance);
      expect(summary.todayRecommendedYen).toBe(allowance);
    },
  );

  it("puts a future period's surplus remainder on the earliest days", () => {
    const summary = calculatePeriodSummary(
      { ...period, budgetYen: 3002 },
      { jstToday: "2028-02-27" },
    );

    expect(summary.todayRecommendedYen).toBe(0);
    expect(summary.dailyRows.map((row) => row.recommendedYen)).toEqual([
      1001, 1001, 1000,
    ]);
  });

  it("starts distributing a shortage at today when prior days have no recommendation", () => {
    const summary = calculatePeriodSummary(period, {
      jstToday: "2028-02-29",
      dailyTotals: [
        {
          date: "2028-02-28",
          budgetPeriodId: period.id,
          totalUsedYen: 1001,
        },
        {
          date: "2028-02-29",
          budgetPeriodId: period.id,
          totalUsedYen: 500,
        },
      ],
    });

    expect(summary.dailyRows.map((row) => row.recommendedYen)).toEqual([
      0, 999, 1000,
    ]);
    expect(summary.todayRecommendedYen).toBe(999);
    expect(summary.varianceFromRecommendationYen).toBe(-499);
  });

  it("keeps today's recommendation zero when a legacy date normalizes to a calendar day", () => {
    const summary = calculatePeriodSummary(
      { ...period, endDate: "2028-03-02", budgetYen: 4000 },
      { jstToday: "2028-02-30" },
    );

    expect(summary.daysRemaining).toBe(1);
    expect(summary.todayRecommendedYen).toBe(0);
    expect(summary.dailyRows.map((row) => row.recommendedYen)).toEqual([
      0, 0, 0, 4000,
    ]);
  });

  it("groups duplicate totals and preserves the exact safe upper bound", () => {
    const dailyTotals = [
      { date: "2028-03-01", totalUsedYen: 1 },
      { date: "2028-02-29", totalUsedYen: 1 },
      { date: "2028-02-28", totalUsedYen: Number.MAX_SAFE_INTEGER - 3 },
      { date: "2028-02-28", totalUsedYen: 1 },
    ].map((row) => ({ ...row, budgetPeriodId: period.id }));
    const summary = calculatePeriodSummary(period, {
      jstToday: "2028-03-01",
      dailyTotals,
    });

    const firstDayTotal = Number.MAX_SAFE_INTEGER - 2;
    expect(summary.dailyRows.map((row) => row.usedYen)).toEqual([
      firstDayTotal,
      1,
      1,
    ]);
    expect(summary.plannedTotalYen).toBe(Number.MAX_SAFE_INTEGER);
    expect(summary.spentToDateYen).toBe(Number.MAX_SAFE_INTEGER);

    expect(() =>
      calculatePeriodSummary(period, {
        jstToday: "2028-03-01",
        dailyTotals: [...dailyTotals, dailyTotals[0]],
      }),
    ).toThrow(expect.objectContaining({ code: "YEN_TOTAL_OUT_OF_RANGE" }));
  });
});
