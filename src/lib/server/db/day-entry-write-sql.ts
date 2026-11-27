import { and, eq, gte, lte, notExists, sql } from "drizzle-orm";
import { createDrizzleD1Database } from "#lib/server/db/client.ts";
import type {
  D1Database,
  D1PreparedStatement,
} from "#lib/server/db/d1-types.ts";
import type {
  D1DayEntryCommand,
  D1DayEntryHistoryWriteInput,
  D1DayEntryTotalWriteInput,
  D1DayEntryWriteMode,
  DayEntryReceipt,
} from "#lib/server/db/day-entry-writer-types.ts";
import {
  invalidStoredHistoryYen,
  isStoredYen,
  maxStoredYen,
  otherDaysTotal,
} from "#lib/server/db/day-entry-yen-sql.ts";
import {
  budget_periods,
  daily_operation_histories_v2,
  daily_totals,
  day_entry_receipts_v2,
} from "#lib/server/db/schema.ts";

type Database = ReturnType<typeof createDrizzleD1Database>;

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
  input: D1DayEntryCommand,
): D1PreparedStatement[] {
  const database = createDrizzleD1Database(db);
  const receipt = input.receipt;
  const existingReceipt = receipt && findReceipt(database, receipt);
  const eligible = and(
    periodContainsDate(input.total.budgetPeriodId, input.total.date),
    existingReceipt && notExists(existingReceipt),
  );
  const statements = [
    prepareDayEntryStatement(
      db,
      buildHistoryInsert(database, input.history, input.mode, eligible),
    ),
    prepareDayEntryStatement(
      db,
      buildDailyTotalUpsert(database, input.total, input.mode, eligible),
    ),
  ];
  if (receipt && existingReceipt) {
    // Both writes see the old receipt state. Record the original request only
    // after them, within the same transaction, then read the winning receipt.
    const receiptInsert = database.insert(day_entry_receipts_v2).select(
      database
        .select({
          key: sql<string>`${receipt.key}`.as("key"),
          fingerprint: sql<string>`${receipt.fingerprint}`.as("fingerprint"),
        })
        .from(budget_periods)
        .where(eligible),
    );
    statements.push(
      prepareDayEntryStatement(db, receiptInsert),
      prepareDayEntryStatement(db, existingReceipt),
    );
  }
  return statements;
}

function findReceipt(database: Database, receipt: DayEntryReceipt) {
  return database
    .select({ fingerprint: day_entry_receipts_v2.fingerprint })
    .from(day_entry_receipts_v2)
    .where(eq(day_entry_receipts_v2.key, receipt.key));
}

function periodContainsDate(budgetPeriodId: string, date: string) {
  return and(
    eq(budget_periods.id, budgetPeriodId),
    lte(budget_periods.start_date, date),
    gte(budget_periods.end_date, date),
  );
}

function buildHistoryInsert(
  database: Database,
  history: D1DayEntryHistoryWriteInput,
  mode: D1DayEntryWriteMode,
  eligible: ReturnType<typeof and>,
) {
  const currentTotal = sql<number>`coalesce(${daily_totals.total_used_yen}, 0)`;
  // D1 can bind a JS number as REAL. Cast validated inputs before arithmetic.
  const input = sql<number>`cast(${history.inputYen} as integer)`;
  const afterTotal = mode === "add" ? sql`${currentTotal} + ${input}` : input;
  const isValid = sql`
    (${daily_totals.date} is null or ${isStoredYen(daily_totals.total_used_yen)})
    and ${otherDaysTotal(history.budgetPeriodId, history.date)} <= ${maxStoredYen} - (${afterTotal})
    and not exists (
      select 1 from ${daily_operation_histories_v2}
      where budget_period_id = ${history.budgetPeriodId} and date = ${history.date}
        and ${invalidStoredHistoryYen}
    )
  `;
  // Migrated histories have negative ranks. Begin new writes at a positive rank.
  const lastDayOrder = database
    .select({
      value: sql<number>`max(${daily_operation_histories_v2.write_order})`,
    })
    .from(daily_operation_histories_v2)
    .where(
      and(
        eq(
          daily_operation_histories_v2.budget_period_id,
          history.budgetPeriodId,
        ),
        eq(daily_operation_histories_v2.date, history.date),
      ),
    );
  return database.insert(daily_operation_histories_v2).select(
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
        input_yen: input.as("input_yen"),
        // Use the existing NOT NULL constraint to abort the whole D1 batch.
        before_total_yen:
          sql<number>`case when ${isValid} then ${currentTotal} end`.as(
            "before_total_yen",
          ),
        after_total_yen: afterTotal.as("after_total_yen"),
        memo: sql<string | null>`${history.memo}`.as("memo"),
        created_at: sql<string>`${history.createdAt}`.as("created_at"),
        write_order: sql<number>`max(0, coalesce((${lastDayOrder}), 0)) + 1`.as(
          "write_order",
        ),
      })
      .from(budget_periods)
      .leftJoin(
        daily_totals,
        and(
          eq(daily_totals.budget_period_id, budget_periods.id),
          eq(daily_totals.date, history.date),
        ),
      )
      .where(eligible),
  );
}

function buildDailyTotalUpsert(
  database: Database,
  total: D1DayEntryTotalWriteInput,
  mode: D1DayEntryWriteMode,
  eligible: ReturnType<typeof and>,
) {
  const excludedTotal = sql`excluded.${sql.identifier(daily_totals.total_used_yen.name)}`;
  return database
    .insert(daily_totals)
    .select(
      database
        .select({
          budget_period_id: sql<string>`${total.budgetPeriodId}`.as(
            "budget_period_id",
          ),
          date: sql<string>`${total.date}`.as("date"),
          year_month: sql<string>`${total.yearMonth}`.as("year_month"),
          total_used_yen:
            sql<number>`cast(${total.totalUsedYen} as integer)`.as(
              "total_used_yen",
            ),
          updated_at: sql<string>`${total.nowIso}`.as("updated_at"),
        })
        .from(budget_periods)
        .where(eligible),
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
    });
}
