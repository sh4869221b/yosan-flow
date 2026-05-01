import { desc, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const budget_period_statuses = ["active", "closed"] as const;
export const daily_operation_types = ["add", "overwrite"] as const;

export const budget_periods = sqliteTable(
  "budget_periods",
  {
    id: text("id").primaryKey(),
    start_date: text("start_date").notNull(),
    end_date: text("end_date").notNull(),
    budget_yen: integer("budget_yen").notNull(),
    status: text("status", { enum: budget_period_statuses })
      .notNull()
      .default("active"),
    predecessor_period_id: text("predecessor_period_id").references(
      (): AnySQLiteColumn => budget_periods.id,
    ),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_budget_periods_start_end").on(table.start_date, table.end_date),
    check(
      "budget_periods_budget_yen_non_negative",
      sql`${table.budget_yen} >= 0`,
    ),
    check(
      "budget_periods_status_allowed",
      sql`${table.status} IN ('active', 'closed')`,
    ),
    check(
      "budget_periods_start_date_before_end_date",
      sql`${table.start_date} <= ${table.end_date}`,
    ),
  ],
);

export const daily_totals = sqliteTable(
  "daily_totals",
  {
    budget_period_id: text("budget_period_id")
      .notNull()
      .references(() => budget_periods.id),
    date: text("date").notNull(),
    year_month: text("year_month").notNull(),
    total_used_yen: integer("total_used_yen").notNull(),
    updated_at: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.budget_period_id, table.date] }),
    index("idx_daily_totals_period_date").on(
      table.budget_period_id,
      table.date,
    ),
    check(
      "daily_totals_total_used_yen_non_negative",
      sql`${table.total_used_yen} >= 0`,
    ),
  ],
);

export const daily_operation_histories = sqliteTable(
  "daily_operation_histories",
  {
    id: text("id").primaryKey(),
    budget_period_id: text("budget_period_id")
      .notNull()
      .references(() => budget_periods.id),
    date: text("date").notNull(),
    operation_type: text("operation_type", {
      enum: daily_operation_types,
    }).notNull(),
    input_yen: integer("input_yen").notNull(),
    before_total_yen: integer("before_total_yen").notNull(),
    after_total_yen: integer("after_total_yen").notNull(),
    memo: text("memo"),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    index("idx_daily_histories_period_date_created_at").on(
      table.budget_period_id,
      table.date,
      desc(table.created_at),
    ),
    check(
      "daily_operation_histories_operation_type_allowed",
      sql`${table.operation_type} IN ('add', 'overwrite')`,
    ),
    check(
      "daily_operation_histories_input_yen_non_negative",
      sql`${table.input_yen} >= 0`,
    ),
    check(
      "daily_operation_histories_before_total_yen_non_negative",
      sql`${table.before_total_yen} >= 0`,
    ),
    check(
      "daily_operation_histories_after_total_yen_non_negative",
      sql`${table.after_total_yen} >= 0`,
    ),
  ],
);

export type BudgetPeriodRow = typeof budget_periods.$inferSelect;
export type NewBudgetPeriodRow = typeof budget_periods.$inferInsert;
export type DailyTotalRow = typeof daily_totals.$inferSelect;
export type NewDailyTotalRow = typeof daily_totals.$inferInsert;
export type DailyOperationHistoryRow =
  typeof daily_operation_histories.$inferSelect;
export type NewDailyOperationHistoryRow =
  typeof daily_operation_histories.$inferInsert;
