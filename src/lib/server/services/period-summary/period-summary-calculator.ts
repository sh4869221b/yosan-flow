import { Effect } from "effect";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import { getJstDateParts } from "#lib/server/time/jst-format.ts";
import { buildDailyTotalMap } from "./daily-totals";
import { buildDateRange } from "./date-range";
import { buildFoodPaceSummary, type FoodPaceSummary } from "./food-pace";
import { createFoodPaceRecommender } from "./recommendations";

export class PeriodNotFoundError extends Error {
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
  isRecorded: boolean;
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

    return calculatePeriodSummary(period, options);
  });
}

function getRemainingDayCount(
  periodDates: string[],
  period: BudgetPeriodRecord,
  jstToday: string,
): number {
  if (jstToday <= period.startDate) return periodDates.length;
  if (jstToday > period.endDate) return 0;

  const todayIndex = periodDates.indexOf(jstToday);
  // Preserve the final-day fallback of slicing at index -1.
  return todayIndex === -1
    ? Math.min(1, periodDates.length)
    : periodDates.length - todayIndex;
}

export function calculatePeriodSummary(
  period: BudgetPeriodRecord,
  options: BuildPeriodSummaryOptions = {},
): PeriodSummary {
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
  let plannedTotalYen = 0;
  let spentToDateYen = 0;
  let spentBeforeTodayYen = 0;
  for (const [date, totalUsedYen] of dailyTotalsByDate) {
    plannedTotalYen += totalUsedYen;
    if (date <= jstToday) spentToDateYen += totalUsedYen;
    if (date < jstToday) spentBeforeTodayYen += totalUsedYen;
  }
  const usedTodayYen = dailyTotalsByDate.get(jstToday) ?? 0;
  const remainingAtTodayYen = period.budgetYen - spentBeforeTodayYen;
  const isTodayWithinPeriod = isDateWithinPeriod(
    jstToday,
    period.startDate,
    period.endDate,
  );
  const daysRemaining = getRemainingDayCount(periodDates, period, jstToday);
  const remainingStartIndex = periodLengthDays - daysRemaining;

  const remainingYen = period.budgetYen - plannedTotalYen;
  const overspentYen = remainingYen < 0 ? Math.abs(remainingYen) : 0;
  const foodPace = buildFoodPaceSummary({
    budgetYen: period.budgetYen,
    periodLengthDays,
    spentBeforeTodayYen,
    usedTodayYen,
    daysFromToday: isTodayWithinPeriod ? daysRemaining : 0,
  });
  const getRecommendedYen = createFoodPaceRecommender({
    foodPace,
    remainingAtTodayYen,
    daysRemaining,
  });
  let todayRecommendedYen = 0;
  const dailyRows: PeriodDailyRow[] = periodDates.map((date, index) => {
    const isToday = date === jstToday;
    const usedYen = dailyTotalsByDate.get(date);
    const dayOffset = index - remainingStartIndex;
    const recommendedYen = dayOffset < 0 ? 0 : getRecommendedYen(dayOffset);
    if (isToday) todayRecommendedYen = recommendedYen;
    return {
      date,
      label: isToday ? "today" : "planned",
      usedYen: usedYen ?? 0,
      isRecorded: usedYen !== undefined,
      recommendedYen,
    };
  });
  const varianceFromRecommendationYen = usedTodayYen - todayRecommendedYen;
  const remainingAfterDayYenPreview = remainingAtTodayYen - usedTodayYen;

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
}
