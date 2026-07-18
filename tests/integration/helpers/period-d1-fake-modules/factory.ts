import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import { createPeriodAwarePreparedStatement } from "./prepared-statement";
import type { PreparedStatementObserver } from "./prepared-statement";
import { createPeriodAwareD1FakeState } from "./table-state";
import { toDailyTotalKey } from "./table-state";
import type { BudgetPeriodRow } from "./types";

export type PeriodAwareD1FakeOptions = {
  readonly periods?: readonly BudgetPeriodRow[];
  readonly totalDates?: Readonly<Record<string, readonly string[]>>;
  readonly historyDates?: Readonly<Record<string, readonly string[]>>;
  readonly linkedBoundaryChangesOverride?: number;
  readonly onStatementRun?: PreparedStatementObserver;
};

export function createPeriodAwareD1Fake(
  preparedSql: string[] = [],
  options: PeriodAwareD1FakeOptions = {},
): D1Database {
  const state = createPeriodAwareD1FakeState();
  for (const period of options.periods ?? []) {
    state.periods.set(period.id, { ...period });
  }
  for (const [periodId, dates] of Object.entries(options.totalDates ?? {})) {
    for (const date of dates) {
      state.dailyTotals.set(toDailyTotalKey(date, periodId), {
        budget_period_id: periodId,
        date,
        year_month: date.slice(0, 7),
        total_used_yen: 1,
        updated_at: "2026-07-18T00:00:00.000Z",
      });
    }
  }
  for (const [periodId, dates] of Object.entries(options.historyDates ?? {})) {
    for (const date of dates) {
      state.dailyOperationHistories.push({
        rowid: state.nextHistoryRowId(),
        id: `seed-history-${periodId}-${date}`,
        budget_period_id: periodId,
        date,
        operation_type: "add",
        input_yen: 1,
        before_total_yen: 0,
        after_total_yen: 1,
        memo: null,
        created_at: "2026-07-18T00:00:00.000Z",
      });
    }
  }

  return {
    prepare(sql: string) {
      preparedSql.push(sql);
      return createPeriodAwarePreparedStatement(sql, state, {
        linkedBoundaryChangesOverride: options.linkedBoundaryChangesOverride,
        onStatementRun: options.onStatementRun,
      });
    },
    async batch<T = unknown>(
      statements: D1PreparedStatement[],
    ): Promise<D1Result<T>[]> {
      const snapshot = state.snapshot();
      try {
        for (const statement of statements) {
          await statement.run();
        }
      } catch (error) {
        state.restore(snapshot);
        throw error;
      }
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    withSession() {
      throw new Error("D1 sessions are not implemented in this test fake");
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}
