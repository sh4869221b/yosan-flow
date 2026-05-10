import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import {
  createDrizzleD1Database,
  createInMemoryDatabaseClient,
} from "$lib/server/db/client";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import { budget_periods } from "$lib/server/db/schema";

function createD1BindingStub(input: {
  rawRows?: unknown[][];
  onPrepare?: (query: string) => void;
  onBind?: (args: unknown[]) => void;
}): D1Database {
  const statement: D1PreparedStatement = {
    bind(...args) {
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
      return {};
    },
  };

  return {
    prepare(query) {
      input.onPrepare?.(query);
      return statement;
    },
    async batch() {
      return [];
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
