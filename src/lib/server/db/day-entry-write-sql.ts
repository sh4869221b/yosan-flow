import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import type {
  D1Database,
  D1PreparedStatement,
} from "#lib/server/db/d1-types.ts";
import type {
  D1DayEntryHistoryWriteInput,
  D1DayEntryTotalWriteInput,
  D1DayEntryWriteMode,
} from "#lib/server/db/day-entry-writer-types.ts";
import {
  budget_periods,
  daily_operation_histories,
  daily_totals,
} from "#lib/server/db/schema.ts";

// Compile, but never execute, each builder here. The writer executes the complete
// batch once so history reads the current total and both writes commit together.
export function prepareDayEntryStatement(
  db: D1Database,
  query: { toSQL(): { sql: string; params: unknown[] } },
): D1PreparedStatement {
  const compiled = query.toSQL();
  return db.prepare(compiled.sql).bind(...compiled.params);
}

export function buildDailyEntryStatements(
  db: D1Database,
  input: {
    total: D1DayEntryTotalWriteInput;
    history: D1DayEntryHistoryWriteInput;
    mode: D1DayEntryWriteMode;
  },
): D1PreparedStatement[] {
  return [
    buildHistoryInsertStatement(db, input.history, input.mode),
    buildDailyTotalUpsertStatement(db, input.total, input.mode),
  ];
}

function periodContainsDate(budgetPeriodId: string, date: string) {
  return and(
    eq(budget_periods.id, budgetPeriodId),
    lte(budget_periods.start_date, date),
    gte(budget_periods.end_date, date),
  );
}

function buildHistoryInsertStatement(
  db: D1Database,
  history: D1DayEntryHistoryWriteInput,
  mode: D1DayEntryWriteMode,
): D1PreparedStatement {
  const database = createDrizzleD1Database(db);
  const currentTotalQuery = database
    .select({ value: daily_totals.total_used_yen })
    .from(daily_totals)
    .where(
      and(
        eq(daily_totals.budget_period_id, history.budgetPeriodId),
        eq(daily_totals.date, history.date),
      ),
    );
  const currentTotal = sql<number>`coalesce((${currentTotalQuery}), 0)`;
  return prepareDayEntryStatement(
    db,
    database.insert(daily_operation_histories).select(
      database
        .select({
          id: sql<string>`${history.id}`.as("id"),
          budget_period_id: sql<string>`${history.budgetPeriodId}`.as(
            "budget_period_id",
          ),
          date: sql<string>`${history.date}`.as("date"),
          operation_type: sql<D1DayEntryWriteMode>`${history.operationType}`.as(
            "operation_type",
          ),
          input_yen: sql<number>`${history.inputYen}`.as("input_yen"),
          before_total_yen: currentTotal.as("before_total_yen"),
          after_total_yen: (mode === "add"
            ? sql<number>`${currentTotal} + ${history.inputYen}`
            : sql<number>`${history.inputYen}`
          ).as("after_total_yen"),
          memo: sql<string | null>`${history.memo}`.as("memo"),
          created_at: sql<string>`${history.createdAt}`.as("created_at"),
        })
        .from(budget_periods)
        .where(periodContainsDate(history.budgetPeriodId, history.date)),
    ),
  );
}

function buildDailyTotalUpsertStatement(
  db: D1Database,
  total: D1DayEntryTotalWriteInput,
  mode: D1DayEntryWriteMode,
): D1PreparedStatement {
  const database = createDrizzleD1Database(db);
  const excludedTotal = sql`excluded.${sql.identifier(daily_totals.total_used_yen.name)}`;
  return prepareDayEntryStatement(
    db,
    database
      .insert(daily_totals)
      .select(
        database
          .select({
            budget_period_id: sql<string>`${total.budgetPeriodId}`.as(
              "budget_period_id",
            ),
            date: sql<string>`${total.date}`.as("date"),
            year_month: sql<string>`${total.yearMonth}`.as("year_month"),
            total_used_yen: sql<number>`${total.totalUsedYen}`.as(
              "total_used_yen",
            ),
            updated_at: sql<string>`${total.nowIso}`.as("updated_at"),
          })
          .from(budget_periods)
          .where(periodContainsDate(total.budgetPeriodId, total.date)),
      )
      .onConflictDoUpdate({
        target: [daily_totals.budget_period_id, daily_totals.date],
        set: {
          year_month: sql`excluded.${sql.identifier(daily_totals.year_month.name)}`,
          total_used_yen:
            mode === "add"
              ? sql`${daily_totals.total_used_yen} + ${excludedTotal}`
              : excludedTotal,
          updated_at: sql`excluded.${sql.identifier(daily_totals.updated_at.name)}`,
        },
      }),
  );
}
