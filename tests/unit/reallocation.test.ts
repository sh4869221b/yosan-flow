import { describe, expect, it } from "vitest";
import { calculateRemainingYen } from "$lib/server/domain/budget";
import { buildDailyRecommendations } from "$lib/server/domain/reallocation";

describe("buildDailyRecommendations", () => {
  it("distributes remainder from today forward", () => {
    expect(
      buildDailyRecommendations({
        remainingYen: 100,
        dates: ["2026-04-18", "2026-04-19", "2026-04-20"],
      }),
    ).toEqual([
      { date: "2026-04-18", recommendedYen: 34 },
      { date: "2026-04-19", recommendedYen: 33 },
      { date: "2026-04-20", recommendedYen: 33 },
    ]);
  });

  it("returns 0 yen recommendations for overspent budgets", () => {
    expect(
      buildDailyRecommendations({
        remainingYen: -1,
        dates: ["2026-04-18", "2026-04-19"],
      }),
    ).toEqual([
      { date: "2026-04-18", recommendedYen: 0 },
      { date: "2026-04-19", recommendedYen: 0 },
    ]);
  });

  it("divides by days including today", () => {
    expect(
      buildDailyRecommendations({
        remainingYen: 100,
        dates: ["2026-04-18", "2026-04-19"],
      }),
    ).toEqual([
      { date: "2026-04-18", recommendedYen: 50 },
      { date: "2026-04-19", recommendedYen: 50 },
    ]);
  });

  it("returns full remaining amount when one day is left", () => {
    expect(
      buildDailyRecommendations({
        remainingYen: 1234,
        dates: ["2026-04-30"],
      }),
    ).toEqual([{ date: "2026-04-30", recommendedYen: 1234 }]);
  });
});

describe("calculateRemainingYen", () => {
  it("includes planned spending in remaining calculation", () => {
    expect(
      calculateRemainingYen({
        budgetYen: 10000,
        spentToDateYen: 3000,
        plannedYen: 2500,
      }),
    ).toBe(4500);
  });
});
