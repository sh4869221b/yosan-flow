import { Effect } from "effect";
import type { BudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { getJstDateParts } from "$lib/server/time/jst";

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

type FoodPaceStatus = "bonus" | "adjustment" | "on_track";

type FoodPaceSummary = {
  status: FoodPaceStatus;
  baseDailyYen: number;
  todayAllowanceYen: number;
  usedTodayYen: number;
  todayRemainingYen: number;
  todayBonusYen: number;
  adjustmentYen: number;
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

function toDateValue(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function nextDate(date: string): string {
  return new Date(toDateValue(date) + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function buildDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) {
    return [];
  }

  const rows: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    rows.push(cursor);
    cursor = nextDate(cursor);
  }
  return rows;
}

function buildDailyTotalMap(
  periodId: string,
  startDate: string,
  endDate: string,
  dailyTotals: PeriodSummaryDailyTotal[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of dailyTotals) {
    if (row.budgetPeriodId !== periodId) {
      continue;
    }
    if (!isDateWithinPeriod(row.date, startDate, endDate)) {
      continue;
    }
    map.set(row.date, (map.get(row.date) ?? 0) + row.totalUsedYen);
  }
  return map;
}

function resolveDaysRemaining(
  startDate: string,
  endDate: string,
  jstToday: string,
): number {
  if (jstToday < startDate) {
    return buildDateRange(startDate, endDate).length;
  }
  if (jstToday > endDate) {
    return 0;
  }
  return buildDateRange(jstToday, endDate).length;
}

function buildFoodPaceSummary(input: {
  budgetYen: number;
  periodLengthDays: number;
  spentBeforeTodayYen: number;
  usedTodayYen: number;
  remainingDates: string[];
}): FoodPaceSummary {
  const baseDailyYen =
    input.periodLengthDays === 0
      ? 0
      : Math.floor(input.budgetYen / input.periodLengthDays);
  const daysFromToday = input.remainingDates.length;
  if (daysFromToday === 0) {
    return {
      status: "on_track",
      baseDailyYen,
      todayAllowanceYen: 0,
      usedTodayYen: input.usedTodayYen,
      todayRemainingYen: input.usedTodayYen === 0 ? 0 : -input.usedTodayYen,
      todayBonusYen: 0,
      adjustmentYen: 0,
    };
  }

  const remainingAtTodayStartYen = input.budgetYen - input.spentBeforeTodayYen;
  const expectedRemainingAtBasePaceYen = baseDailyYen * daysFromToday;
  const paceDeltaYen =
    remainingAtTodayStartYen - expectedRemainingAtBasePaceYen;
  const todayBonusYen = paceDeltaYen > 0 ? paceDeltaYen : 0;
  const shortageYen = paceDeltaYen < 0 ? Math.abs(paceDeltaYen) : 0;
  const adjustmentBaseYen =
    shortageYen > 0 ? Math.floor(shortageYen / daysFromToday) : 0;
  const adjustmentRemainderYen = shortageYen % daysFromToday;
  const adjustmentYen =
    adjustmentBaseYen + (adjustmentRemainderYen > 0 ? 1 : 0);
  const todayAllowanceYen = Math.max(
    0,
    baseDailyYen + todayBonusYen - adjustmentYen,
  );

  return {
    status:
      todayBonusYen > 0
        ? "bonus"
        : adjustmentYen > 0
          ? "adjustment"
          : "on_track",
    baseDailyYen,
    todayAllowanceYen,
    usedTodayYen: input.usedTodayYen,
    todayRemainingYen: todayAllowanceYen - input.usedTodayYen,
    todayBonusYen,
    adjustmentYen,
  };
}

function buildFoodPaceRecommendations(input: {
  foodPace: FoodPaceSummary;
  remainingAtTodayYen: number;
  remainingDates: string[];
}): Array<{ date: string; recommendedYen: number }> {
  const expectedRemainingAtBasePaceYen =
    input.foodPace.baseDailyYen * input.remainingDates.length;
  const surplusYen = Math.max(
    0,
    input.remainingAtTodayYen - expectedRemainingAtBasePaceYen,
  );
  const shortageYen = Math.max(
    0,
    expectedRemainingAtBasePaceYen - input.remainingAtTodayYen,
  );
  const surplusBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(surplusYen / input.remainingDates.length);
  const surplusRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : surplusYen % input.remainingDates.length;
  const adjustmentBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(shortageYen / input.remainingDates.length);
  const adjustmentRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : shortageYen % input.remainingDates.length;

  return input.remainingDates.map((date, index) => {
    if (input.foodPace.todayBonusYen > 0) {
      return {
        date,
        recommendedYen:
          index === 0
            ? input.foodPace.todayAllowanceYen
            : input.foodPace.baseDailyYen,
      };
    }

    if (surplusYen > 0) {
      const extraYen = surplusBaseYen + (index < surplusRemainderYen ? 1 : 0);
      return {
        date,
        recommendedYen: input.foodPace.baseDailyYen + extraYen,
      };
    }

    const adjustmentYen =
      adjustmentBaseYen + (index < adjustmentRemainderYen ? 1 : 0);
    return {
      date,
      recommendedYen: Math.max(0, input.foodPace.baseDailyYen - adjustmentYen),
    };
  });
}

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
    const plannedTotalYen = [...dailyTotalsByDate.values()].reduce(
      (total, current) => total + current,
      0,
    );
    const spentToDateYen = [...dailyTotalsByDate.entries()].reduce(
      (total, [date, value]) => {
        return date <= jstToday ? total + value : total;
      },
      0,
    );
    const spentBeforeTodayYen = [...dailyTotalsByDate.entries()].reduce(
      (total, [date, value]) => {
        return date < jstToday ? total + value : total;
      },
      0,
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
