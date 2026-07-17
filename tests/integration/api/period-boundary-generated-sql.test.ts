import { spawnSync } from "node:child_process";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createD1BudgetPeriodRepository,
  createInMemoryBudgetPeriodRepository,
  type BudgetPeriodRecord,
  type LinkedPeriodBoundaryUpdateCommand,
} from "$lib/server/db/budget-period-repository";
import { runApiEffect } from "$lib/server/effect/runtime";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

const target: BudgetPeriodRecord = {
  id: "target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 100_000,
  status: "active",
  predecessorPeriodId: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const successor: BudgetPeriodRecord = {
  id: "successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 120_000,
  status: "closed",
  predecessorPeriodId: target.id,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const malformedCommand: LinkedPeriodBoundaryUpdateCommand = {
  target: {
    before: target,
    after: { ...target, startDate: "2026-02-30", endDate: "2026-07-21" },
  },
  successor: {
    before: successor,
    after: { ...successor, startDate: "2026-07-22" },
  },
  nowIso: "2026-07-18T00:00:00.000Z",
};

function toD1Row(period: BudgetPeriodRecord) {
  return {
    id: period.id,
    start_date: period.startDate,
    end_date: period.endDate,
    budget_yen: period.budgetYen,
    status: period.status,
    predecessor_period_id: period.predecessorPeriodId,
    created_at: period.createdAt,
    updated_at: period.updatedAt,
  };
}

async function readPair(
  repository: ReturnType<typeof createInMemoryBudgetPeriodRepository>,
) {
  const currentTarget = await Effect.runPromise(repository.findById(target.id));
  const currentSuccessor = await Effect.runPromise(
    repository.findById(successor.id),
  );
  if (!currentTarget || !currentSuccessor) {
    throw new Error("generated SQL fixture lost its linked period pair");
  }
  return [currentTarget, currentSuccessor] as const;
}

function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function executeGeneratedSql(sql: string, payload: string) {
  const boundSql = sql.replace("?", quoteSql(payload));
  const schema = `
    create table budget_periods (
      id text primary key, start_date text not null, end_date text not null,
      budget_yen integer not null, status text not null,
      predecessor_period_id text, created_at text not null, updated_at text not null
    );
    create table daily_totals (budget_period_id text, date text);
    create table daily_operation_histories (budget_period_id text, date text);
    insert into budget_periods values
      ('target','2026-06-21','2026-07-20',100000,'active',null,'2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z'),
      ('successor','2026-07-21','2026-08-19',120000,'closed','target','2026-06-02T00:00:00.000Z','2026-06-02T00:00:00.000Z');
    ${boundSql};
    select changes();
    select id,start_date,end_date from budget_periods order by id;
  `;
  return spawnSync("sqlite3", [":memory:"], {
    input: schema,
    encoding: "utf8",
  });
}

describe("linked boundary generated SQL", () => {
  it.each(["d1", "in-memory"] as const)(
    "rejects a noncanonical calendar date without mutation with %s",
    async (implementation) => {
      // Given a linked pair and February 30 in the proposed target range
      const repository =
        implementation === "d1"
          ? createD1BudgetPeriodRepository({
              db: createPeriodAwareD1Fake([], {
                periods: [target, successor].map(toD1Row),
              }),
            })
          : createInMemoryBudgetPeriodRepository([target, successor]);
      const before = await readPair(repository);

      // When the linked-boundary command reaches the persistence gate
      const failure = runApiEffect(
        repository.updateLinkedBoundary(malformedCommand),
      );

      // Then it returns a typed conflict and preserves both records
      await expect(failure).rejects.toMatchObject({
        code: "PERIOD_UPDATE_CONFLICT",
      });
      await expect(readPair(repository)).resolves.toEqual(before);
    },
  );

  it("rejects a noncanonical calendar date in independently executed SQL", async () => {
    // Given the actual Drizzle SQL and payload captured before fake evaluation
    const captures: {
      readonly sql: string;
      readonly args: readonly unknown[];
    }[] = [];
    const repository = createD1BudgetPeriodRepository({
      db: createPeriodAwareD1Fake([], {
        periods: [target, successor].map(toD1Row),
        onStatementRun: (statement) => {
          if (statement.sql.toLowerCase().includes('update "budget_periods"')) {
            captures.push(statement);
          }
        },
      }),
    });
    await expect(
      runApiEffect(repository.updateLinkedBoundary(malformedCommand)),
    ).rejects.toMatchObject({ code: "PERIOD_UPDATE_CONFLICT" });
    const captured = captures[0];
    const payload = captured?.args[0];
    if (!captured || typeof payload !== "string") {
      throw new Error("generated SQL fixture did not capture one payload bind");
    }

    // When the captured statement is executed by SQLite without the shared fake gate
    const execution = executeGeneratedSql(captured.sql, payload);
    const lines = execution.stdout.trim().split("\n");
    const canonicalFormatGuards = captured.sql.match(/ glob /g)?.length ?? 0;
    const canonicalRoundTrips = captured.sql.match(/strftime\(/g)?.length ?? 0;

    // Then SQL itself qualifies neither row and keeps the canonical stored pair
    expect({
      status: execution.status,
      stderr: execution.stderr,
      canonicalFormatGuards,
      canonicalRoundTrips,
      lines,
    }).toEqual({
      status: 0,
      stderr: "",
      canonicalFormatGuards: 4,
      canonicalRoundTrips: 4,
      lines: [
        "0",
        "successor|2026-07-21|2026-08-19",
        "target|2026-06-21|2026-07-20",
      ],
    });
  });
});
