import type { PeriodSummary } from "$lib/dashboard/controller-types";

export function createSummary(
  firstDateUsedYen: number,
  secondDateUsedYen = 0,
): PeriodSummary {
  return {
    periodId: "period-1",
    startDate: "2026-07-12",
    endDate: "2026-07-13",
    budgetYen: 10_000,
    status: "active",
    periodLengthDays: 2,
    spentToDateYen: firstDateUsedYen + secondDateUsedYen,
    plannedTotalYen: firstDateUsedYen + secondDateUsedYen,
    remainingYen: 10_000 - firstDateUsedYen - secondDateUsedYen,
    overspentYen: 0,
    todayRecommendedYen: 5_000,
    varianceFromRecommendationYen: 0,
    remainingAfterDayYenPreview: 10_000,
    daysRemaining: 2,
    foodPace: {
      status: "on_track",
      baseDailyYen: 5_000,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
      todayAllowanceYen: 5_000,
      usedTodayYen: firstDateUsedYen,
      todayRemainingYen: 5_000 - firstDateUsedYen,
    },
    dailyRows: [
      {
        date: "2026-07-12",
        label: "today",
        usedYen: firstDateUsedYen,
        recommendedYen: 5_000,
      },
      {
        date: "2026-07-13",
        label: "planned",
        usedYen: secondDateUsedYen,
        recommendedYen: 5_000,
      },
    ],
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
