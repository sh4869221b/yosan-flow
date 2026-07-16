import { Effect, Fiber, Scheduler } from "effect";
import { expect, it, vi } from "vitest";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

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
  await new Promise((resolve) => setTimeout(resolve, 0));

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
  const scheduler = new Scheduler.ControlledScheduler();
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

  Effect.runFork(Fiber.interrupt(owner), { scheduler, immediate: true });
  scheduler.step();
  Effect.runFork(Fiber.interrupt(waiter), { scheduler, immediate: true });
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
