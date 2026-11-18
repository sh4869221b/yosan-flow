import {
  assertValidDate,
  assertValidInputYen,
} from "#lib/server/domain/daily-entry.ts";
import { assertValidPeriodRange } from "#lib/server/db/budget-period-validation-coordinator.ts";
import type { BudgetPeriodRecord } from "#lib/server/db/budget-period-types.ts";
import type { BudgetPeriodRow } from "#lib/server/db/schema.ts";

export function clonePeriod(record: BudgetPeriodRecord): BudgetPeriodRecord {
  return { ...record };
}

export function assertValidBudgetPeriodRow(row: BudgetPeriodRow): void {
  // D1 is a separate input boundary; its SQL constraints do not ensure that
  // dates are real calendar dates or amounts fit in a safe JS integer.
  assertValidDate(row.start_date);
  assertValidDate(row.end_date);
  assertValidInputYen(row.budget_yen);
  assertValidPeriodRange(row.start_date, row.end_date);
}

export function toBudgetPeriodRecord(row: BudgetPeriodRow): BudgetPeriodRecord {
  assertValidBudgetPeriodRow(row);
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
