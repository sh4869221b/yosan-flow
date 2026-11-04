import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDateRange } from "#lib/server/services/period-summary/date-range.ts";
import { calculatePeriodSummary } from "#lib/server/services/period-summary/period-summary-calculator.ts";

afterEach(() => vi.restoreAllMocks());

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
      expect(buildDateRange(start, end)).toEqual(expected);
    },
  );

  it.each([
    ["2028-02-28", "2028-03-01", ["2028-02-28", "2028-02-29", "2028-03-01"]],
    ["2027-12-31", "2028-01-01", ["2027-12-31", "2028-01-01"]],
    ["2028-03-01", "2028-02-28", []],
  ])("returns inclusive days from %s through %s", (start, end, expected) => {
    expect(buildDateRange(start, end)).toEqual(expected);
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
    },
  );
});
