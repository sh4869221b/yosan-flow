import { Effect } from "effect";
import type { BudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { getJstDateParts } from "$lib/server/time/jst";
import {
  buildDailyTotalMap,
  sumDailyTotals,
  sumDailyTotalsBeforeDate,
  sumDailyTotalsThroughDate,
} from "./daily-totals";
import { buildDateRange, resolveDaysRemaining } from "./date-range";
import { buildFoodPaceSummary, type FoodPaceSummary } from "./food-pace";
import { buildFoodPaceRecommendations } from "./recommendations";

class PeriodNotFoundError extends Error {
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`Period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

type PeriodDailyRow = {
  date: string;
  label: "today" | "planned";
  usedYen: number;
  recommendedYen: number;
};

export type PeriodSummaryDailyTotal = {
  date: string;
  budgetPeriodId: string;
  totalUsedYen: number;
};

export type PeriodSummary = {
  periodId: string;
  startDate: string;
  endDate: string;
  budgetYen: number;
  status: "active" | "closed";
  periodLengthDays: number;
  spentToDateYen: number;
  plannedTotalYen: number;
  remainingYen: number;
  overspentYen: number;
  todayRecommendedYen: number;
  varianceFromRecommendationYen: number;
  remainingAfterDayYenPreview: number;
  daysRemaining: number;
  foodPace: FoodPaceSummary;
  dailyRows: PeriodDailyRow[];
};

export type BuildPeriodSummaryOptions = {
  jstToday?: string;
  dailyTotals?: PeriodSummaryDailyTotal[];
};

export function buildPeriodSummary(
  budgetPeriodRepository: BudgetPeriodRepository,
  periodId: string,
  options: BuildPeriodSummaryOptions = {},
): Effect.Effect<PeriodSummary, Error> {
  return Effect.gen(function* () {
    const period = yield* budgetPeriodRepository.findById(periodId);
    if (!period) {
      return yield* Effect.fail(new PeriodNotFoundError(periodId));
    }

    const jstToday = options.jstToday ?? getJstDateParts(new Date()).date;
    const dailyTotals = options.dailyTotals ?? [];
    const dailyTotalsByDate = buildDailyTotalMap(
      period.id,
      period.startDate,
      period.endDate,
      dailyTotals,
    );
    const periodDates = buildDateRange(period.startDate, period.endDate);
    const periodLengthDays = periodDates.length;
    const plannedTotalYen = sumDailyTotals(dailyTotalsByDate);
    const spentToDateYen = sumDailyTotalsThroughDate(
      dailyTotalsByDate,
      jstToday,
    );
    const spentBeforeTodayYen = sumDailyTotalsBeforeDate(
      dailyTotalsByDate,
      jstToday,
    );
    const usedTodayYen = dailyTotalsByDate.get(jstToday) ?? 0;
    const remainingAtTodayYen = period.budgetYen - spentBeforeTodayYen;
    const isTodayWithinPeriod = isDateWithinPeriod(
      jstToday,
      period.startDate,
      period.endDate,
    );
    const remainingDates =
      jstToday < period.startDate
        ? periodDates
        : jstToday > period.endDate
          ? []
          : buildDateRange(jstToday, period.endDate);
    const paceDates = isTodayWithinPeriod ? remainingDates : [];

    const remainingYen = period.budgetYen - plannedTotalYen;
    const overspentYen = remainingYen < 0 ? Math.abs(remainingYen) : 0;
    const foodPace = buildFoodPaceSummary({
      budgetYen: period.budgetYen,
      periodLengthDays,
      spentBeforeTodayYen,
      usedTodayYen,
      remainingDates: paceDates,
    });
    const recommendations = buildFoodPaceRecommendations({
      foodPace,
      remainingAtTodayYen,
      remainingDates,
    });
    const recommendationMap = new Map(
      recommendations.map((row) => [row.date, row.recommendedYen]),
    );
    const dailyRows: PeriodDailyRow[] = periodDates.map((date) => ({
      date,
      label: date === jstToday ? "today" : "planned",
      usedYen: dailyTotalsByDate.get(date) ?? 0,
      recommendedYen: recommendationMap.get(date) ?? 0,
    }));
    const todayRecommendedYen = recommendationMap.get(jstToday) ?? 0;
    const varianceFromRecommendationYen = usedTodayYen - todayRecommendedYen;
    const remainingAfterDayYenPreview = remainingAtTodayYen - usedTodayYen;
    const daysRemaining = resolveDaysRemaining(
      period.startDate,
      period.endDate,
      jstToday,
    );

    return {
      periodId: period.id,
      startDate: period.startDate,
      endDate: period.endDate,
      budgetYen: period.budgetYen,
      status: period.status,
      periodLengthDays,
      spentToDateYen,
      plannedTotalYen,
      remainingYen,
      overspentYen,
      todayRecommendedYen,
      varianceFromRecommendationYen,
      remainingAfterDayYenPreview,
      daysRemaining,
      foodPace,
      dailyRows,
    };
  });
}
