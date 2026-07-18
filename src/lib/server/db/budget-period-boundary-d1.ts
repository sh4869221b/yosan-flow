import { sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { findD1BudgetPeriodById } from "$lib/server/db/budget-period-d1-query";
import {
  LinkedPeriodBoundaryConflictError,
  LinkedPeriodBoundaryInvariantError,
  type LinkedPeriodBoundaryUpdateCommand,
  type LinkedPeriodBoundaryUpdateResult,
} from "$lib/server/db/budget-period-types";
import type * as schema from "$lib/server/db/schema";
import { budget_periods } from "$lib/server/db/schema";

type D1Database = DrizzleD1Database<typeof schema>;

function jsonField(inputCte: SQL, path: string): SQL {
  return sql`json_extract((select payload from ${inputCte}), ${sql.raw(`'$.${path}'`)})`;
}

function canonicalDatePredicate(value: SQL): SQL {
  return sql`length(${value}) = 10
    and ${value} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    and strftime('%Y-%m-%d', ${value}) = ${value}`;
}

function fullSnapshotPredicate(
  alias: string,
  path: string,
  inputCte: SQL,
): SQL {
  const column = (name: string) => sql.raw(`${alias}.${name}`);
  return sql`
    ${column("id")} = ${jsonField(inputCte, `${path}.id`)}
    and ${column("start_date")} = ${jsonField(inputCte, `${path}.startDate`)}
    and ${column("end_date")} = ${jsonField(inputCte, `${path}.endDate`)}
    and ${column("budget_yen")} = ${jsonField(inputCte, `${path}.budgetYen`)}
    and ${column("status")} = ${jsonField(inputCte, `${path}.status`)}
    and ${column("predecessor_period_id")} is ${jsonField(inputCte, `${path}.predecessorPeriodId`)}
    and ${column("created_at")} = ${jsonField(inputCte, `${path}.createdAt`)}
    and ${column("updated_at")} = ${jsonField(inputCte, `${path}.updatedAt`)}
  `;
}

function buildGlobalPredicate(inputCte: SQL): SQL {
  const targetId = jsonField(inputCte, "target.before.id");
  const successorId = jsonField(inputCte, "successor.before.id");
  const targetStart = jsonField(inputCte, "target.after.startDate");
  const targetEnd = jsonField(inputCte, "target.after.endDate");
  const successorStart = jsonField(inputCte, "successor.after.startDate");
  const successorEnd = jsonField(inputCte, "successor.after.endDate");
  const predecessorId = jsonField(
    inputCte,
    "target.before.predecessorPeriodId",
  );
  return sql`
    ${jsonField(inputCte, "target.after.id")} = ${targetId}
    and ${jsonField(inputCte, "successor.after.id")} = ${successorId}
    and ${targetId} <> ${successorId}
    and (${canonicalDatePredicate(targetStart)})
    and (${canonicalDatePredicate(targetEnd)})
    and (${canonicalDatePredicate(successorStart)})
    and (${canonicalDatePredicate(successorEnd)})
    and ${targetStart} <= ${targetEnd}
    and ${successorStart} <= ${successorEnd}
    and ${jsonField(inputCte, "target.after.budgetYen")} >= 0
    and ${jsonField(inputCte, "successor.after.budgetYen")} >= 0
    and date(${jsonField(inputCte, "target.before.endDate")}, '+1 day') = ${jsonField(inputCte, "successor.before.startDate")}
    and date(${targetEnd}, '+1 day') = ${successorStart}
    and exists (
      select 1 from budget_periods as target_before
      where ${fullSnapshotPredicate("target_before", "target.before", inputCte)}
    )
    and exists (
      select 1 from budget_periods as successor_before
      where ${fullSnapshotPredicate("successor_before", "successor.before", inputCte)}
    )
    and (
      select count(*) from budget_periods as linked_successor
      where linked_successor.predecessor_period_id = ${targetId}
    ) = 1
    and exists (
      select 1 from budget_periods as named_successor
      where named_successor.id = ${successorId}
        and named_successor.predecessor_period_id = ${targetId}
    )
    and (
      ${predecessorId} is null
      or exists (
        select 1 from budget_periods as target_predecessor
        where target_predecessor.id = ${predecessorId}
          and date(target_predecessor.end_date, '+1 day') = ${targetStart}
      )
    )
    and not exists (
      select 1 from budget_periods as third_period
      where third_period.id not in (${targetId}, ${successorId})
        and (
          (third_period.start_date <= ${targetEnd} and third_period.end_date >= ${targetStart})
          or (third_period.start_date <= ${successorEnd} and third_period.end_date >= ${successorStart})
        )
    )
    and not exists (
      select 1 from daily_totals as displaced_total
      where (
        displaced_total.budget_period_id = ${targetId}
        and (displaced_total.date < ${targetStart} or displaced_total.date > ${targetEnd})
      ) or (
        displaced_total.budget_period_id = ${successorId}
        and (displaced_total.date < ${successorStart} or displaced_total.date > ${successorEnd})
      )
    )
    and not exists (
      select 1 from daily_operation_histories as displaced_history
      where (
        displaced_history.budget_period_id = ${targetId}
        and (displaced_history.date < ${targetStart} or displaced_history.date > ${targetEnd})
      ) or (
        displaced_history.budget_period_id = ${successorId}
        and (displaced_history.date < ${successorStart} or displaced_history.date > ${successorEnd})
      )
    )
  `;
}

export async function updateD1LinkedPeriodBoundary(
  database: D1Database,
  command: LinkedPeriodBoundaryUpdateCommand,
): Promise<LinkedPeriodBoundaryUpdateResult> {
  const input = database
    .$with("linked_boundary_input", {
      payload: sql<string>``.as("payload"),
    })
    .as(sql`select ${JSON.stringify(command)} as payload`);
  const inputCte = sql`${input}`;
  const targetId = jsonField(inputCte, "target.before.id");
  const successorId = jsonField(inputCte, "successor.before.id");
  const result = await database
    .with(input)
    .update(budget_periods)
    .set({
      start_date: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(inputCte, "target.after.startDate")}
        when ${successorId} then ${jsonField(inputCte, "successor.after.startDate")}
        else ${budget_periods.start_date} end`,
      end_date: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(inputCte, "target.after.endDate")}
        when ${successorId} then ${jsonField(inputCte, "successor.after.endDate")}
        else ${budget_periods.end_date} end`,
      budget_yen: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(inputCte, "target.after.budgetYen")}
        when ${successorId} then ${jsonField(inputCte, "successor.after.budgetYen")}
        else ${budget_periods.budget_yen} end`,
      updated_at: jsonField(inputCte, "nowIso"),
    })
    .where(
      sql`${budget_periods.id} in (${targetId}, ${successorId})
        and (${buildGlobalPredicate(inputCte)})`,
    )
    .run();

  if (result.meta.changes === 0) {
    throw new LinkedPeriodBoundaryConflictError();
  }
  if (result.meta.changes !== 2) {
    throw new LinkedPeriodBoundaryInvariantError(result.meta.changes);
  }

  const [updatedTarget, updatedSuccessor] = await Promise.all([
    findD1BudgetPeriodById(database, command.target.before.id),
    findD1BudgetPeriodById(database, command.successor.before.id),
  ]);
  if (!updatedTarget || !updatedSuccessor) {
    throw new LinkedPeriodBoundaryInvariantError(result.meta.changes);
  }
  return {
    changedCount: 2,
    target: updatedTarget,
    successor: updatedSuccessor,
  };
}
