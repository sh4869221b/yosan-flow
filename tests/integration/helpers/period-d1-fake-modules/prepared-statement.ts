import type { D1PreparedStatement } from "#lib/server/db/d1-types.ts";
import { applyBudgetPeriodMutation } from "./budget-period-sql";
import { createD1Result } from "./d1-result";
import {
  applySqlMutation,
  selectFirstRow,
  selectRawRows,
} from "./sql-dispatch";
import { toBudgetPeriodRawRow } from "./raw-row-mapping";
import type { PeriodAwareD1FakeState } from "./table-state";

export type PreparedStatementObserver = (statement: {
  readonly sql: string;
  readonly args: readonly unknown[];
}) => void;

type PreparedStatementOptions = {
  readonly linkedBoundaryChangesOverride?: number;
  readonly onStatementRun?: PreparedStatementObserver;
};

export function createPeriodAwarePreparedStatement(
  sql: string,
  state: PeriodAwareD1FakeState,
  options: PreparedStatementOptions = {},
): D1PreparedStatement {
  let boundArgs: unknown[] = [];

  function rawRows<T = unknown[]>(_options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  function rawRows<T = unknown[]>(_options?: {
    columnNames?: false;
  }): Promise<T[]>;
  async function rawRows<T = unknown[]>(options?: { columnNames?: boolean }) {
    const rows = (
      /\b(?:insert into|update) "budget_periods" [\s\S]+\breturning\b/i.test(
        sql,
      )
        ? returningBudgetPeriods()
        : selectRawRows(sql, boundArgs, state)
    ) as T[];
    if (options?.columnNames) {
      return [[], ...rows] as [string[], ...T[]];
    }
    return rows;
  }

  function returningBudgetPeriods() {
    options.onStatementRun?.({ sql, args: [...boundArgs] });
    return applyBudgetPeriodMutation(
      sql,
      boundArgs,
      state,
      options.linkedBoundaryChangesOverride,
    ).map((row) => toBudgetPeriodRawRow(sql, row));
  }

  const statement: D1PreparedStatement = {
    bind(...args: unknown[]) {
      boundArgs = args;
      return statement;
    },
    async first<T = unknown>() {
      return selectFirstRow<T>(sql, boundArgs, state);
    },
    async all<T = unknown>() {
      return createD1Result([] as T[]);
    },
    raw: rawRows,
    async run<T = Record<string, unknown>>() {
      options.onStatementRun?.({ sql, args: [...boundArgs] });
      const selection = /^select (.*?) from /i.exec(sql)?.[1];
      if (selection) {
        // D1 returns named columns for both SELECT statements in a batch.
        const columns = [...selection.matchAll(/"(\w+)"/g)].map(
          ([, column]) => column,
        );
        const rows = selectRawRows(sql, boundArgs, state).map((values) =>
          Object.fromEntries(
            columns.map((column, index) => [column, values[index]]),
          ),
        );
        return createD1Result(rows as T[]);
      }
      const changes = applySqlMutation(
        sql,
        boundArgs,
        state,
        options.linkedBoundaryChangesOverride,
      );
      return createD1Result([], changes);
    },
  };

  return statement;
}
