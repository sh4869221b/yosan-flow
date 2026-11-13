import {
  and,
  eq,
  exists,
  gt,
  gte,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { createDrizzleD1Database } from "#lib/server/db/client.ts";
import { toBudgetPeriodRecord } from "#lib/server/db/budget-period-row-mapper.ts";
import {
  assertPeriodHasNoOverlap,
  assertPeriodPredecessorContinuity,
  assertPeriodSuccessorContinuity,
} from "#lib/server/db/budget-period-validation-coordinator.ts";
import {
  PeriodNotFoundError,
  PeriodValidationError,
  type CreateBudgetPeriodInput,
  type UpdateBudgetPeriodInput,
} from "#lib/server/db/budget-period-types.ts";
import {
  budget_periods,
  daily_operation_histories,
  daily_totals,
} from "#lib/server/db/schema.ts";
import {
  getNextPeriodStartDate,
  getPreviousPeriodEndDate,
} from "#lib/server/domain/budget-period.ts";

type Database = ReturnType<typeof createDrizzleD1Database>;
type PeriodValues = UpdateBudgetPeriodInput;
type EntryTable = typeof daily_totals | typeof daily_operation_histories;

function outsideEntries(
  database: Database,
  table: EntryTable,
  input: PeriodValues,
) {
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.budget_period_id, input.id),
        or(lt(table.date, input.startDate), gt(table.date, input.endDate)),
      ),
    );
}

// These predicates run in the same SQLite statement as the write. The earlier
// repository reads retain friendly errors but cannot protect against other D1
// requests changing periods or inserting daily entries before this statement.
function validRelations(
  database: Database,
  input: PeriodValues,
  predecessorId: string | SQLWrapper | null,
) {
  const overlapping = alias(budget_periods, "overlapping_period");
  const predecessor = alias(budget_periods, "write_predecessor");
  const successor = alias(budget_periods, "write_successor");
  return and(
    notExists(
      database
        .select({ id: overlapping.id })
        .from(overlapping)
        .where(
          and(
            or(isNull(overlapping.id), ne(overlapping.id, input.id)),
            lte(overlapping.start_date, input.endDate),
            gte(overlapping.end_date, input.startDate),
          ),
        ),
    ),
    predecessorId === null
      ? undefined
      : or(
          typeof predecessorId === "string" ? undefined : isNull(predecessorId),
          exists(
            database
              .select({ id: predecessor.id })
              .from(predecessor)
              .where(
                and(
                  eq(predecessor.id, predecessorId),
                  eq(
                    predecessor.end_date,
                    getPreviousPeriodEndDate(input.startDate),
                  ),
                ),
              ),
          ),
        ),
    notExists(
      database
        .select({ id: successor.id })
        .from(successor)
        .where(
          and(
            eq(successor.predecessor_period_id, input.id),
            ne(successor.start_date, getNextPeriodStartDate(input.endDate)),
          ),
        ),
    ),
  );
}

export function insertD1BudgetPeriod(
  database: Database,
  input: CreateBudgetPeriodInput,
) {
  return (
    database
      .insert(budget_periods)
      .select(
        database
          .select({
            id: sql<string>`${input.id}`.as("id"),
            start_date: sql<string>`${input.startDate}`.as("start_date"),
            end_date: sql<string>`${input.endDate}`.as("end_date"),
            budget_yen: sql<number>`${input.budgetYen}`.as("budget_yen"),
            status: sql<"active" | "closed">`${input.status ?? "active"}`.as(
              "status",
            ),
            predecessor_period_id: sql<
              string | null
            >`${input.predecessorPeriodId ?? null}`.as("predecessor_period_id"),
            created_at: sql<string>`${input.nowIso}`.as("created_at"),
            updated_at: sql<string>`${input.nowIso}`.as("updated_at"),
          })
          // A single constant row allows a guarded insert even into an empty DB.
          .from(sql`(select 1)`)
          .where(
            validRelations(database, input, input.predecessorPeriodId ?? null),
          ),
      )
      // A simultaneous create of the same ID has the same idempotent read result
      // as an ID already present during preflight; it must not become a 500.
      .onConflictDoNothing({ target: budget_periods.id })
      .run()
  );
}

export function updateD1BudgetPeriod(
  database: Database,
  input: UpdateBudgetPeriodInput,
) {
  return database
    .update(budget_periods)
    .set({
      start_date: input.startDate,
      end_date: input.endDate,
      budget_yen: input.budgetYen,
      updated_at: input.nowIso,
    })
    .where(
      and(
        eq(budget_periods.id, input.id),
        validRelations(database, input, budget_periods.predecessor_period_id),
        notExists(outsideEntries(database, daily_totals, input)),
        notExists(outsideEntries(database, daily_operation_histories, input)),
      ),
    )
    .run();
}

export async function rejectD1BudgetPeriodWrite(
  database: Database,
  input: CreateBudgetPeriodInput | UpdateBudgetPeriodInput,
  kind: "create" | "update",
): Promise<never> {
  // Re-read after a failed guard for the existing validation/not-found codes.
  // If state changed again before these reads, still fail rather than retrying
  // a mutation or treating the rejected statement as a successful update.
  const periods = (await database.select().from(budget_periods).all()).map(
    toBudgetPeriodRecord,
  );
  const current = periods.find((period) => period.id === input.id);
  if (kind === "update" && !current) throw new PeriodNotFoundError(input.id);
  const predecessorId =
    kind === "create"
      ? (input as CreateBudgetPeriodInput).predecessorPeriodId
      : current?.predecessorPeriodId;
  const predecessor = periods.find((period) => period.id === predecessorId);
  assertPeriodPredecessorContinuity(
    predecessorId,
    predecessor?.endDate ?? null,
    input.startDate,
  );
  assertPeriodSuccessorContinuity(
    input.endDate,
    periods.filter((period) => period.predecessorPeriodId === input.id),
  );
  assertPeriodHasNoOverlap(periods, input);
  if (kind === "update") {
    const [totals, histories] = await Promise.all([
      outsideEntries(database, daily_totals, input).limit(1).all(),
      outsideEntries(database, daily_operation_histories, input).limit(1).all(),
    ]);
    if (totals.length || histories.length) {
      throw new PeriodValidationError(
        "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
        `period ${input.id} has entries outside the updated range`,
      );
    }
  }
  throw new PeriodValidationError(
    "PERIOD_UPDATE_CONFLICT",
    "period state changed before write",
  );
}
