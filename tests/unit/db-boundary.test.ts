import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  createDrizzleD1Database,
  createInMemoryDatabaseClient,
} from "$lib/server/db/client";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import { budget_periods, daily_totals } from "$lib/server/db/schema";

function createD1BindingStub(input: {
  rawRows?: unknown[][];
  onPrepare?: (query: string) => void;
  onBind?: (args: unknown[]) => void;
  onBatch?: (statements: D1PreparedStatement[]) => void;
  onRun?: (query: string, args: unknown[]) => void;
}): D1Database {
  return {
    prepare(query) {
      input.onPrepare?.(query);
      let boundArgs: unknown[] = [];
      const statement: D1PreparedStatement = {
        bind(...args) {
          boundArgs = args;
          input.onBind?.(args);
          return statement;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
        async raw<T extends unknown[] = unknown[]>() {
          return (input.rawRows ?? []) as T[];
        },
        async run() {
          input.onRun?.(query, boundArgs);
          return { results: [] };
        },
      };
      return statement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]> {
      input.onBatch?.(statements);
      const results = await Promise.all(
        statements.map((statement) => statement.run()),
      );
      return results as T[];
    },
  };
}

describe("database boundary", () => {
  it("runs a typed Drizzle query through the existing D1 binding", async () => {
    const preparedQueries: string[] = [];
    const boundValues: unknown[][] = [];
    const binding = createD1BindingStub({
      rawRows: [["period-1"]],
      onPrepare: (query) => preparedQueries.push(query),
      onBind: (args) => boundValues.push(args),
    });
    const database = createDrizzleD1Database(binding);

    const rows = await database
      .select({ id: budget_periods.id })
      .from(budget_periods)
      .where(eq(budget_periods.id, "period-1"))
      .all();

    expect(rows).toEqual([{ id: "period-1" }]);
    expect(preparedQueries).toHaveLength(1);
    expect(preparedQueries[0]).toContain("budget_periods");
    expect(preparedQueries[0]).toContain("id");
    expect(boundValues).toEqual([["period-1"]]);
  });

  it("runs typed Drizzle batch queries through the existing D1 binding", async () => {
    const preparedQueries: string[] = [];
    const boundValues: unknown[][] = [];
    const runQueries: string[] = [];
    let batchedStatementCount = 0;
    const binding = createD1BindingStub({
      onPrepare: (query) => preparedQueries.push(query),
      onBind: (args) => boundValues.push(args),
      onBatch: (statements) => {
        batchedStatementCount = statements.length;
      },
      onRun: (query) => runQueries.push(query),
    });
    const database = createDrizzleD1Database(binding);

    await database.batch([
      database.insert(budget_periods).values({
        id: "period-1",
        start_date: "2026-05-01",
        end_date: "2026-05-31",
        budget_yen: 50000,
        status: "active",
        predecessor_period_id: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }),
      database.insert(daily_totals).values({
        budget_period_id: "period-1",
        date: "2026-05-11",
        year_month: "2026-05",
        total_used_yen: 1200,
        updated_at: "2026-05-11T00:00:00.000Z",
      }),
    ]);

    expect(batchedStatementCount).toBe(2);
    expect(preparedQueries).toHaveLength(2);
    expect(preparedQueries[0]).toContain("budget_periods");
    expect(preparedQueries[1]).toContain("daily_totals");
    expect(boundValues).toHaveLength(2);
    expect(runQueries).toEqual(preparedQueries);
  });

  it("keeps the in-memory database client path available", async () => {
    const client = createInMemoryDatabaseClient<{ id: string }>();

    await Effect.runPromise(
      client.transaction(({ state }) =>
        Effect.sync(() => {
          state.budgetPeriods.set("period-1", { id: "period-1" });
        }),
      ),
    );

    const period = await Effect.runPromise(
      client.read(({ state }) =>
        Effect.succeed(state.budgetPeriods.get("period-1")),
      ),
    );

    expect(period).toEqual({ id: "period-1" });
  });
});
