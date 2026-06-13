import type {
  BudgetPeriodRow,
  DailyOperationHistoryRow,
  DailyTotalRow,
} from "./types";

export type PeriodAwareD1FakeSnapshot = {
  periods: Map<string, BudgetPeriodRow>;
  dailyTotals: Map<string, DailyTotalRow>;
  dailyOperationHistories: DailyOperationHistoryRow[];
  nextRowId: number;
};

export type PeriodAwareD1FakeState = {
  periods: Map<string, BudgetPeriodRow>;
  dailyTotals: Map<string, DailyTotalRow>;
  dailyOperationHistories: DailyOperationHistoryRow[];
  nextRowId: number;
  snapshot(): PeriodAwareD1FakeSnapshot;
  restore(snapshot: PeriodAwareD1FakeSnapshot): void;
  nextHistoryRowId(): number;
};

export function toDailyTotalKey(date: string, budgetPeriodId: string): string {
  return `${budgetPeriodId}:${date}`;
}

export function createPeriodAwareD1FakeState(): PeriodAwareD1FakeState {
  const state: PeriodAwareD1FakeState = {
    periods: new Map<string, BudgetPeriodRow>(),
    dailyTotals: new Map<string, DailyTotalRow>(),
    dailyOperationHistories: [],
    nextRowId: 1,
    snapshot() {
      return {
        periods: new Map(
          [...state.periods.entries()].map(([key, row]) => [key, { ...row }]),
        ),
        dailyTotals: new Map(
          [...state.dailyTotals.entries()].map(([key, row]) => [
            key,
            { ...row },
          ]),
        ),
        dailyOperationHistories: state.dailyOperationHistories.map((row) => ({
          ...row,
        })),
        nextRowId: state.nextRowId,
      };
    },
    restore(snapshot: PeriodAwareD1FakeSnapshot) {
      state.periods = snapshot.periods;
      state.dailyTotals = snapshot.dailyTotals;
      state.dailyOperationHistories = snapshot.dailyOperationHistories;
      state.nextRowId = snapshot.nextRowId;
    },
    nextHistoryRowId() {
      const rowId = state.nextRowId;
      state.nextRowId += 1;
      return rowId;
    },
  };

  return state;
}
