import { Deferred, Effect, Fiber } from "effect";
import { expect, it } from "vitest";
import { createInMemoryDatabaseClient } from "#lib/server/db/client.ts";

it("reads committed state at execution and refreshes it on each execution", async () => {
  const database = createInMemoryDatabaseClient<string>();
  let calls = 0;
  const read = database.read((tx) => {
    calls += 1;
    return Effect.succeed(tx.state.budgetPeriods.get("period"));
  });
  expect(calls).toBe(0);

  for (const value of ["first", "second"]) {
    await Effect.runPromise(
      database.transaction((tx) =>
        Effect.sync(() => tx.state.budgetPeriods.set("period", value)),
      ),
    );
    expect(await Effect.runPromise(read)).toBe(value);
  }
  expect(calls).toBe(2);
});

it("keeps an executing read isolated from later transaction commits", async () => {
  const database = createInMemoryDatabaseClient<string>();
  const started = Effect.runSync(Deferred.make<void>());
  const gate = Effect.runSync(Deferred.make<void>());
  const read = Effect.runFork(
    database.read((tx) =>
      Effect.gen(function* () {
        yield* Deferred.succeed(started, undefined);
        yield* Deferred.await(gate);
        return tx.state.budgetPeriods.get("period");
      }),
    ),
  );
  try {
    await Effect.runPromise(Deferred.await(started));
    await Effect.runPromise(
      database.transaction((tx) =>
        Effect.sync(() => tx.state.budgetPeriods.set("period", "later")),
      ),
    );
    Effect.runSync(Deferred.succeed(gate, undefined));
    expect(await Effect.runPromise(Fiber.join(read))).toBeUndefined();
    expect(database.dumpState().budgetPeriods.get("period")).toBe("later");
  } finally {
    await Effect.runPromise(Fiber.interrupt(read));
  }
});

it("discards read mutations and creates a new deep snapshot when reused", async () => {
  const database = createInMemoryDatabaseClient<{ amount: number }>();
  await Effect.runPromise(
    database.transaction((tx) =>
      Effect.sync(() => tx.state.budgetPeriods.set("period", { amount: 100 })),
    ),
  );
  const read = database.read((tx) =>
    Effect.sync(() => {
      const period = tx.state.budgetPeriods.get("period")!;
      const previous = period.amount;
      period.amount = 200;
      tx.state.budgetPeriods.delete("period");
      return previous;
    }),
  );
  expect(await Effect.runPromise(read)).toBe(100);
  expect(await Effect.runPromise(read)).toBe(100);
  expect(database.dumpState().budgetPeriods.get("period")).toEqual({
    amount: 100,
  });
});
