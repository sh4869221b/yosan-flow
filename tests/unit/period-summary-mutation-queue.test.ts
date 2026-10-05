import { Deferred, Effect, Exit, Fiber } from "effect";
import { expect, it, vi } from "vitest";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";
import { ControlledScheduler } from "./helpers/controlled-scheduler";

it("publishes the owner's revision before a queued mutation captures it", () => {
  const scheduler = new ControlledScheduler();
  const revision = createPeriodSummaryRevision();
  const response = Effect.runSync(Deferred.make<void>());
  let capturedRevision: number | undefined;
  Effect.runFork(
    revision
      .withMutationSlot("period-1", "period", Deferred.await(response))
      .pipe(Effect.tap(() => Effect.sync(() => revision.advance("period-1")))),
    { scheduler },
  );
  Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "history",
      Effect.sync(() => {
        capturedRevision = revision.get("period-1");
      }),
    ),
    { scheduler },
  );

  Effect.runSync(Deferred.succeed(response, undefined));

  expect(revision.get("period-1")).toBe(1);
  expect(capturedRevision).toBeUndefined();
  scheduler.step();
  expect(capturedRevision).toBe(1);
});

it.each([
  {
    kind: "failure",
    effect: Effect.fail("failure"),
    exit: Exit.fail("failure"),
  },
  { kind: "defect", effect: Effect.die("defect"), exit: Exit.die("defect") },
])("releases a failed owner without changing its $kind", ({ effect, exit }) => {
  const scheduler = new ControlledScheduler();
  const revision = createPeriodSummaryRevision();
  const response = Effect.runSync(Deferred.make<void>());
  const owner = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "period",
      Deferred.await(response).pipe(Effect.andThen(effect)),
    ),
    { scheduler },
  );
  const nextMutation = vi.fn();
  Effect.runFork(
    revision.withMutationSlot("period-1", "history", Effect.sync(nextMutation)),
    { scheduler },
  );

  Effect.runSync(Deferred.succeed(response, undefined));

  expect(owner.pollUnsafe()).toEqual(exit);
  expect(nextMutation).not.toHaveBeenCalled();
  scheduler.step();
  expect(nextMutation).toHaveBeenCalledOnce();
});

it("releases an interrupted owner and removes an interrupted waiter", async () => {
  const revision = createPeriodSummaryRevision();
  const firstStarted = Promise.withResolvers<void>();
  const firstOwner = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "add",
      Effect.sync(() => firstStarted.resolve()).pipe(
        Effect.andThen(Effect.never),
      ),
    ),
  );
  await firstStarted.promise;

  const interruptedUse = vi.fn();
  const interruptedWaiter = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "history",
      Effect.sync(interruptedUse),
    ),
  );
  await Effect.runPromise(Fiber.interrupt(interruptedWaiter));
  await Effect.runPromise(Fiber.interrupt(firstOwner));

  await Effect.runPromise(
    revision
      .withMutationSlot("period-1", "period", Effect.void)
      .pipe(Effect.timeout("100 millis")),
  );
  expect(interruptedUse).not.toHaveBeenCalled();
});

it("releases a waiter interrupted after grant but before acquire returns", () => {
  const scheduler = new ControlledScheduler();
  const revision = createPeriodSummaryRevision();
  let ownerStarted = false;
  let waiterUse = false;
  let laterUse = false;
  const owner = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "add",
      Effect.sync(() => {
        ownerStarted = true;
      }).pipe(Effect.andThen(Effect.never)),
    ),
    { scheduler },
  );
  scheduler.step();
  expect(ownerStarted).toBe(true);
  const waiter = Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "history",
      Effect.sync(() => {
        waiterUse = true;
      }).pipe(Effect.andThen(Effect.never)),
    ),
    { scheduler },
  );
  scheduler.step();

  // runFork starts synchronously in v4. Leave the queued grant unstepped so
  // interruption still exercises ownership before acquire returns.
  Effect.runFork(Fiber.interrupt(owner), { scheduler });
  expect(waiterUse).toBe(false);
  Effect.runFork(Fiber.interrupt(waiter), { scheduler });
  scheduler.step();
  expect(waiterUse).toBe(false);

  Effect.runFork(
    revision.withMutationSlot(
      "period-1",
      "period",
      Effect.sync(() => {
        laterUse = true;
      }),
    ),
    { scheduler },
  );
  for (let index = 0; index < 5; index += 1) scheduler.step();
  expect(laterUse).toBe(true);
});
