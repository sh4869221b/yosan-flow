import { assertValidDate } from "#lib/server/domain/daily-entry.ts";
import type {
  DailyHistoryRecord,
  InsertDailyHistoryInput,
} from "#lib/server/db/daily-history-types.ts";
import type { DailyOperationHistoryRow } from "#lib/server/db/schema.ts";

export function toDailyHistoryRecord(
  row: DailyOperationHistoryRow,
): DailyHistoryRecord {
  assertValidDate(row.date);
  return {
    id: row.id,
    date: row.date,
    budgetPeriodId: row.budget_period_id,
    operationType: row.operation_type,
    inputYen: row.input_yen,
    beforeTotalYen: row.before_total_yen,
    afterTotalYen: row.after_total_yen,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

export function toDailyHistoryRecordFromInput(
  input: InsertDailyHistoryInput,
): DailyHistoryRecord {
  return {
    id: input.id,
    date: input.date,
    budgetPeriodId: input.budgetPeriodId,
    operationType: input.operationType,
    inputYen: input.inputYen,
    beforeTotalYen: input.beforeTotalYen,
    afterTotalYen: input.afterTotalYen,
    memo: input.memo,
    createdAt: input.createdAt,
  };
}
