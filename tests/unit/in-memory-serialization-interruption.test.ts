import { Deferred, Effect, Fiber } from "effect";
import { expect, it } from "vitest";
import { createInMemoryDatabaseClient } from "#lib/server/db/client.ts";
import { createInMemoryApiServices } from "#lib/server/services/api-services/in-memory.ts";

it("removes an interrupted transaction waiter without blocking later transactions", async () => {
  const database = createInMemoryDatabaseClient<string>();
  const gate = Effect.runSync(Deferred.make<void>());
  const started = Effect.runSync(Deferred.make<void>());
  const owner = Effect.runFork(
    database.transaction((tx) =>
      Effect.gen(function* () {
        tx.state.budgetPeriods.set("owner", "committed");
        yield* Deferred.succeed(started, undefined);
        yield* Deferred.await(gate);
      }),
    ),
  );
  await Effect.runPromise(Deferred.await(started));
  let cancelledRan = false;
  const cancelled = Effect.runFork(
    database.transaction(() =>
      Effect.sync(() => {
        cancelledRan = true;
      }),
    ),
  );
  await Effect.runPromise(Fiber.interrupt(cancelled));
  const later = Effect.runFork(
    database.transaction((tx) =>
      Effect.sync(() => {
        expect(tx.state.budgetPeriods.get("owner")).toBe("committed");
        tx.state.budgetPeriods.set("later", "committed");
      }),
    ),
  );
  try {
    expect(later.pollUnsafe()).toBeUndefined();
    Effect.runSync(Deferred.succeed(gate, undefined));
    await Effect.runPromise(Fiber.join(owner));
    await Effect.runPromise(Fiber.join(later).pipe(Effect.timeout("1 second")));
    expect(cancelledRan).toBe(false);
    expect(database.dumpState().budgetPeriods.size).toBe(2);
  } finally {
    await Effect.runPromise(Fiber.interrupt(later));
    await Effect.runPromise(Fiber.interrupt(owner));
  }
});

it("releases the service mutation queue after interrupting a waiting create", async () => {
  const services = createInMemoryApiServices();
  const gate = Effect.runSync(Deferred.make<void>());
  const started = Effect.runSync(Deferred.make<void>());
  const createPeriod = services.budgetPeriodRepository.createPeriod;
  services.budgetPeriodRepository.createPeriod = (input) =>
    input.id === "owner"
      ? Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.andThen(Effect.suspend(() => createPeriod(input))),
        )
      : createPeriod(input);
  const create = (id: string, startDate: string, endDate: string) =>
    services.createPeriod({ id, startDate, endDate, budgetYen: 1_000 });
  const owner = Effect.runFork(create("owner", "2026-07-01", "2026-07-10"));
  await Effect.runPromise(Deferred.await(started));
  const cancelled = Effect.runFork(
    create("cancelled", "2026-07-11", "2026-07-20"),
  );
  await Effect.runPromise(Fiber.interrupt(cancelled));
  const later = Effect.runFork(create("later", "2026-07-21", "2026-07-30"));
  try {
    expect(later.pollUnsafe()).toBeUndefined();
    Effect.runSync(Deferred.succeed(gate, undefined));
    await Effect.runPromise(Fiber.join(owner));
    await Effect.runPromise(Fiber.join(later).pipe(Effect.timeout("1 second")));
    expect(
      (await Effect.runPromise(services.listPeriods())).map(
        (period) => period.id,
      ),
    ).toEqual(["owner", "later"]);
  } finally {
    await Effect.runPromise(Fiber.interrupt(later));
    await Effect.runPromise(Fiber.interrupt(owner));
  }
});

it.each(["failure", "defect", "interruption"])(
  "rolls back and releases a transaction after %s",
  async (outcome) => {
    const database = createInMemoryDatabaseClient<string>();
    const started = Effect.runSync(Deferred.make<void>());
    const gate = Effect.runSync(Deferred.make<void>());
    const owner = Effect.runFork(
      database.transaction((tx) =>
        Effect.gen(function* () {
          tx.state.budgetPeriods.set("rollback", "uncommitted");
          yield* Deferred.succeed(started, undefined);
          yield* Deferred.await(gate);
          return yield* outcome === "failure"
            ? Effect.fail(new Error("failure"))
            : Effect.die("defect");
        }),
      ),
    );
    await Effect.runPromise(Deferred.await(started));
    const later = Effect.runFork(
      database.transaction((tx) =>
        Effect.sync(() => {
          expect(tx.state.budgetPeriods.has("rollback")).toBe(false);
          tx.state.budgetPeriods.set("later", "committed");
        }),
      ),
    );
    try {
      expect(later.pollUnsafe()).toBeUndefined();
      if (outcome === "interruption")
        await Effect.runPromise(Fiber.interrupt(owner));
      else {
        Effect.runSync(Deferred.succeed(gate, undefined));
        await Effect.runPromise(Fiber.await(owner));
      }
      await Effect.runPromise(
        Fiber.join(later).pipe(Effect.timeout("1 second")),
      );
      expect([...database.dumpState().budgetPeriods.keys()]).toEqual(["later"]);
    } finally {
      await Effect.runPromise(Fiber.interrupt(later));
      await Effect.runPromise(Fiber.interrupt(owner));
    }
  },
);
