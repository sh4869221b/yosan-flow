import { spawnSync } from "node:child_process";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createD1BudgetPeriodRepository,
  createInMemoryBudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

import {
  target,
  successor,
  malformedCommand,
  toD1Row,
  earlierBoundary,
} from "./period-boundary-sql-fixture";

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

function executeGeneratedSql(sql: string, payload: string, setup = "") {
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
    ${setup}
    ${boundSql};
    select changes();
    select id,start_date,end_date from budget_periods order by id;
  `;
  // D1 uses a much smaller depth/cursor budget than the CLI default of 1000.
  const result = spawnSync("sqlite3", ["-bail", ":memory:"], {
    input: `.limit expr_depth 100\n.limit expr_depth\n${schema}`,
    encoding: "utf8",
  });
  expect(result.error).toBeUndefined();
  expect(result.stdout).toMatch(/^(?:\s*expr_depth 100\n)+/);
  return {
    ...result,
    stdout: result.stdout.replace(/^(?:\s*expr_depth 100\n)+/, ""),
  };
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

  it("executes the earlier boundary atomically and rejects displaced data in real SQLite", async () => {
    const captures: {
      readonly sql: string;
      readonly args: readonly unknown[];
    }[] = [];
    const repository = createD1BudgetPeriodRepository({
      db: createPeriodAwareD1Fake([], {
        periods: [target, successor].map(toD1Row),
        onStatementRun: (statement) => {
          if (statement.sql.toLowerCase().includes('update "budget_periods"'))
            captures.push(statement);
        },
      }),
    });
    await runApiEffect(repository.updateLinkedBoundary(earlierBoundary));
    const captured = captures[0];
    if (!captured || typeof captured.args[0] !== "string")
      throw new Error("missing SQL");
    expect(captures).toHaveLength(1);
    expect(captured.args).toEqual([JSON.stringify(earlierBoundary)]);
    expect(captured.sql.match(/\?/g)).toHaveLength(1);
    expect(captured.sql).toContain('from "linked_boundary_input"');
    expect(captured.sql).toContain('"linked_boundary_input"."payload"');
    expect(captured.sql).not.toMatch(/select\s+(?:"payload"|payload)\s+from/i);
    expect(captured.sql).not.toContain(earlierBoundary.nowIso);
    const success = executeGeneratedSql(captured.sql, captured.args[0]);
    expect(success.status).toBe(0);
    expect(success.stdout.trim().split("\n")).toEqual([
      "2",
      "successor|2026-07-20|2026-08-19",
      "target|2026-06-21|2026-07-19",
    ]);
    for (const table of ["daily_totals", "daily_operation_histories"]) {
      const blocked = executeGeneratedSql(
        captured.sql,
        captured.args[0],
        `insert into ${table} values ('target','2026-07-20');`,
      );
      expect(blocked.status).toBe(0);
      expect(blocked.stdout.trim().split("\n")).toEqual([
        "0",
        "successor|2026-07-21|2026-08-19",
        "target|2026-06-21|2026-07-20",
      ]);
    }
  });

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
