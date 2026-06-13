import type { BudgetPeriodRecord } from "$lib/server/db/budget-period-types";
import type { BudgetPeriodRow } from "$lib/server/db/schema";

export function clonePeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  return { ...record };
}

export function toBudgetPeriodRecord(row: BudgetPeriodRow): BudgetPeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetYen: row.budget_yen,
    status: row.status,
    predecessorPeriodId: row.predecessor_period_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
