import {
  and,
  count,
  eq,
  exists,
  gte,
  isNull,
  lt,
  lte,
  gt,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import { findD1BudgetPeriodById } from "#lib/server/db/budget-period-d1-query.ts";
import {
  LinkedPeriodBoundaryConflictError,
  LinkedPeriodBoundaryInvariantError,
  type BudgetPeriodRecord,
  type LinkedPeriodBoundaryAfter,
  type LinkedPeriodBoundaryUpdateCommand,
  type LinkedPeriodBoundaryUpdateResult,
} from "#lib/server/db/budget-period-types.ts";
import type * as schema from "#lib/server/db/schema.ts";
import {
  budget_periods,
  daily_totals,
  daily_operation_histories,
} from "#lib/server/db/schema.ts";

type D1Database = DrizzleD1Database<typeof schema>;
type SnapshotPath = "target.before" | "successor.before";
type InputPath =
  | "nowIso"
  | `${SnapshotPath}.${keyof BudgetPeriodRecord}`
  | `${"target.after" | "successor.after"}.${keyof LinkedPeriodBoundaryAfter}`;

function jsonField(payload: SQL<string>, path: InputPath): SQL {
  // Only the static JSON path is inlined; the command remains one bound value.
  return sql`json_extract(${payload}, ${sql`${`$.${path}`}`.inlineParams()})`;
}

function canonicalDatePredicate(value: SQL): SQL {
  return sql`length(${value}) = 10
    and ${value} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    and strftime('%Y-%m-%d', ${value}) = ${value}`;
}

function fullSnapshotPredicate(
  period: ReturnType<typeof alias<typeof budget_periods, string>>,
  path: SnapshotPath,
  payload: SQL<string>,
) {
  return and(
    eq(period.id, jsonField(payload, `${path}.id`)),
    eq(period.start_date, jsonField(payload, `${path}.startDate`)),
    eq(period.end_date, jsonField(payload, `${path}.endDate`)),
    eq(period.budget_yen, jsonField(payload, `${path}.budgetYen`)),
    eq(period.status, jsonField(payload, `${path}.status`)),
    sql`${period.predecessor_period_id} is ${jsonField(payload, `${path}.predecessorPeriodId`)}`,
    eq(period.created_at, jsonField(payload, `${path}.createdAt`)),
    eq(period.updated_at, jsonField(payload, `${path}.updatedAt`)),
  );
}

function buildGlobalPredicate(database: D1Database, payload: SQL<string>) {
  const targetBefore = alias(budget_periods, "target_before");
  const successorBefore = alias(budget_periods, "successor_before");
  const linkedSuccessor = alias(budget_periods, "linked_successor");
  const namedSuccessor = alias(budget_periods, "named_successor");
  const targetPredecessor = alias(budget_periods, "target_predecessor");
  const outerSuccessor = alias(budget_periods, "outer_successor");
  const thirdPeriod = alias(budget_periods, "third_period");
  const displacedTotal = alias(daily_totals, "displaced_total");
  const displacedHistory = alias(
    daily_operation_histories,
    "displaced_history",
  );
  const targetId = jsonField(payload, "target.before.id");
  const successorId = jsonField(payload, "successor.before.id");
  const targetStart = jsonField(payload, "target.after.startDate");
  const targetEnd = jsonField(payload, "target.after.endDate");
  const successorStart = jsonField(payload, "successor.after.startDate");
  const successorEnd = jsonField(payload, "successor.after.endDate");
  const predecessorId = jsonField(payload, "target.before.predecessorPeriodId");
  const one = { value: sql`1` };
  return and(
    eq(jsonField(payload, "target.after.id"), targetId),
    eq(jsonField(payload, "successor.after.id"), successorId),
    ne(targetId, successorId),
    canonicalDatePredicate(targetStart),
    canonicalDatePredicate(targetEnd),
    canonicalDatePredicate(successorStart),
    canonicalDatePredicate(successorEnd),
    lte(targetStart, targetEnd),
    lte(successorStart, successorEnd),
    gte(jsonField(payload, "target.after.budgetYen"), sql`0`),
    gte(jsonField(payload, "successor.after.budgetYen"), sql`0`),
    eq(
      sql`date(${jsonField(payload, "target.before.endDate")}, '+1 day')`,
      jsonField(payload, "successor.before.startDate"),
    ),
    eq(sql`date(${targetEnd}, '+1 day')`, successorStart),
    exists(
      database
        .select(one)
        .from(targetBefore)
        .where(fullSnapshotPredicate(targetBefore, "target.before", payload)),
    ),
    exists(
      database
        .select(one)
        .from(successorBefore)
        .where(
          fullSnapshotPredicate(successorBefore, "successor.before", payload),
        ),
    ),
    eq(
      database
        .select({ count: count() })
        .from(linkedSuccessor)
        .where(eq(linkedSuccessor.predecessor_period_id, targetId)),
      sql`1`,
    ),
    exists(
      database
        .select(one)
        .from(namedSuccessor)
        .where(
          and(
            eq(namedSuccessor.id, successorId),
            eq(namedSuccessor.predecessor_period_id, targetId),
          ),
        ),
    ),
    or(
      isNull(predecessorId),
      exists(
        database
          .select(one)
          .from(targetPredecessor)
          .where(
            and(
              eq(targetPredecessor.id, predecessorId),
              eq(
                sql`date(${targetPredecessor.end_date}, '+1 day')`,
                targetStart,
              ),
            ),
          ),
      ),
    ),
    notExists(
      database
        .select(one)
        .from(outerSuccessor)
        .where(
          and(
            eq(outerSuccessor.predecessor_period_id, successorId),
            sql`date(${successorEnd}, '+1 day') is not ${outerSuccessor.start_date}`,
          ),
        ),
    ),
    notExists(
      database
        .select(one)
        .from(thirdPeriod)
        .where(
          and(
            or(
              isNull(thirdPeriod.id),
              and(
                ne(thirdPeriod.id, targetId),
                ne(thirdPeriod.id, successorId),
              ),
            ),
            or(
              and(
                lte(thirdPeriod.start_date, targetEnd),
                gte(thirdPeriod.end_date, targetStart),
              ),
              and(
                lte(thirdPeriod.start_date, successorEnd),
                gte(thirdPeriod.end_date, successorStart),
              ),
            ),
          ),
        ),
    ),
    notExists(
      database
        .select(one)
        .from(displacedTotal)
        .where(
          or(
            and(
              eq(displacedTotal.budget_period_id, targetId),
              or(
                lt(displacedTotal.date, targetStart),
                gt(displacedTotal.date, targetEnd),
              ),
            ),
            and(
              eq(displacedTotal.budget_period_id, successorId),
              or(
                lt(displacedTotal.date, successorStart),
                gt(displacedTotal.date, successorEnd),
              ),
            ),
          ),
        ),
    ),
    notExists(
      database
        .select(one)
        .from(displacedHistory)
        .where(
          or(
            and(
              eq(displacedHistory.budget_period_id, targetId),
              or(
                lt(displacedHistory.date, targetStart),
                gt(displacedHistory.date, targetEnd),
              ),
            ),
            and(
              eq(displacedHistory.budget_period_id, successorId),
              or(
                lt(displacedHistory.date, successorStart),
                gt(displacedHistory.date, successorEnd),
              ),
            ),
          ),
        ),
    ),
  );
}

export async function updateD1LinkedPeriodBoundary(
  database: D1Database,
  command: LinkedPeriodBoundaryUpdateCommand,
): Promise<LinkedPeriodBoundaryUpdateResult> {
  const payloadColumn = sql<string>`${JSON.stringify(command)}`.as("payload");
  const input = database
    .$with("linked_boundary_input", { payload: payloadColumn })
    .as(sql`select ${payloadColumn.sql} as ${payloadColumn}`);
  // Join the constant one-row input once. Repeated scalar SELECTs of the CTE
  // exhaust D1's SQLite cursor/depth limit before this atomic UPDATE can run.
  const payload = sql<string>`${input}.${input.payload}`;
  const targetId = jsonField(payload, "target.before.id");
  const successorId = jsonField(payload, "successor.before.id");
  const result = await database
    .with(input)
    .update(budget_periods)
    .set({
      start_date: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(payload, "target.after.startDate")}
        when ${successorId} then ${jsonField(payload, "successor.after.startDate")}
        else ${budget_periods.start_date} end`,
      end_date: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(payload, "target.after.endDate")}
        when ${successorId} then ${jsonField(payload, "successor.after.endDate")}
        else ${budget_periods.end_date} end`,
      budget_yen: sql`case ${budget_periods.id}
        when ${targetId} then ${jsonField(payload, "target.after.budgetYen")}
        when ${successorId} then ${jsonField(payload, "successor.after.budgetYen")}
        else ${budget_periods.budget_yen} end`,
      updated_at: jsonField(payload, "nowIso"),
    })
    .from(input)
    .where(
      and(
        or(eq(budget_periods.id, targetId), eq(budget_periods.id, successorId)),
        buildGlobalPredicate(database, payload),
      ),
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
