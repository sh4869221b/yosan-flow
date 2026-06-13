import type { DailyHistoryRecord } from "$lib/server/db/daily-history-repository";
import type { DailyTotalRecord } from "$lib/server/db/daily-total-repository";

export type DayEntryResultShape = {
  dailyTotal: DailyTotalRecord;
  history: DailyHistoryRecord;
};

export type HistoryReplayResultShape = {
  dailyTotal: DailyTotalRecord;
  histories: DailyHistoryRecord[];
};

export function createDayEntryResult(input: {
  dailyTotal: DailyTotalRecord;
  history: DailyHistoryRecord;
}): DayEntryResultShape {
  return {
    dailyTotal: input.dailyTotal,
    history: input.history,
  };
}

export function createHistoryReplayResult(input: {
  dailyTotal: DailyTotalRecord;
  histories: DailyHistoryRecord[];
}): HistoryReplayResultShape {
  return {
    dailyTotal: input.dailyTotal,
    histories: input.histories,
  };
}

export function createEmptyHistoryReplayResult(input: {
  date: string;
  budgetPeriodId: string;
  updatedAt: string;
}): HistoryReplayResultShape {
  return {
    dailyTotal: {
      date: input.date,
      yearMonth: input.date.slice(0, 7),
      budgetPeriodId: input.budgetPeriodId,
      totalUsedYen: 0,
      updatedAt: input.updatedAt,
    },
    histories: [],
  };
}
