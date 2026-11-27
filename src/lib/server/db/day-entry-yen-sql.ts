import { sql, type SQLWrapper } from "drizzle-orm";
import {
  daily_operation_histories_v2,
  daily_totals,
} from "#lib/server/db/schema.ts";
import { MAX_SAFE_YEN } from "#lib/server/domain/yen.ts";

export const maxStoredYen = sql`cast(${MAX_SAFE_YEN} as integer)`;

export function isStoredYen(value: SQLWrapper) {
  return sql`(typeof(${value}) = 'integer' AND ${value} BETWEEN 0 AND ${maxStoredYen})`;
}

// Below 2^53 every partial sum of non-negative safe integers is exact.
// TOTAL avoids SQLite's signed 64-bit SUM overflow on older, oversized data.
// A malformed row contributes an amount above the limit, including NULL.
export function otherDaysTotal(
  periodId: string | SQLWrapper,
  date: string | SQLWrapper,
) {
  return sql`(
    SELECT total(CASE WHEN ${isStoredYen(daily_totals.total_used_yen)}
      THEN ${daily_totals.total_used_yen} ELSE ${MAX_SAFE_YEN + 1} END)
    FROM ${daily_totals}
    WHERE ${daily_totals.budget_period_id} = ${periodId}
      AND ${daily_totals.date} <> ${date}
  )`;
}

export const invalidStoredHistoryYen = sql`NOT (
  ${isStoredYen(daily_operation_histories_v2.input_yen)} AND
  ${isStoredYen(daily_operation_histories_v2.before_total_yen)} AND
  ${isStoredYen(daily_operation_histories_v2.after_total_yen)}
)`;
