import { asc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { toBudgetPeriodRecord } from "$lib/server/db/budget-period-row-mapper";
import type { BudgetPeriodRecord } from "$lib/server/db/budget-period-types";
import type * as schema from "$lib/server/db/schema";
import { budget_periods } from "$lib/server/db/schema";

type D1Database = DrizzleD1Database<typeof schema>;

export async function findD1BudgetPeriodById(
  database: D1Database,
  id: string,
): Promise<BudgetPeriodRecord | null> {
  const [row] = await database
    .select()
    .from(budget_periods)
    .where(eq(budget_periods.id, id))
    .limit(1)
    .all();
  return row ? toBudgetPeriodRecord(row) : null;
}

export async function findD1SuccessorsByPredecessorId(
  database: D1Database,
  predecessorPeriodId: string,
): Promise<BudgetPeriodRecord[]> {
  const rows = await database
    .select()
    .from(budget_periods)
    .where(eq(budget_periods.predecessor_period_id, predecessorPeriodId))
    .orderBy(asc(budget_periods.start_date))
    .all();
  return rows.map((row) => toBudgetPeriodRecord(row));
}
