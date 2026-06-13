import type {
  DailyHistoryRecord,
  InsertDailyHistoryInput,
} from "$lib/server/db/daily-history-types";
import type { DailyOperationHistoryRow } from "$lib/server/db/schema";

export function cloneHistory(row: DailyHistoryRecord): DailyHistoryRecord {
  return { ...row };
}

export function toDailyHistoryRecord(
  row: DailyOperationHistoryRow,
): DailyHistoryRecord {
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

export function toDailyHistoryInsertValues(input: InsertDailyHistoryInput) {
  return {
    id: input.id,
    budget_period_id: input.budgetPeriodId,
    date: input.date,
    operation_type: input.operationType,
    input_yen: input.inputYen,
    before_total_yen: input.beforeTotalYen,
    after_total_yen: input.afterTotalYen,
    memo: input.memo,
    created_at: input.createdAt,
  };
}
