import { Effect, Fiber } from "effect";
import { expect, it } from "vitest";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

it("settles mutation observers when Promise.withResolvers is unavailable", async () => {
  const originalWithResolvers = Promise.withResolvers;
  Reflect.deleteProperty(Promise, "withResolvers");

  try {
    const revision = createPeriodSummaryRevision();
    const sequence = revision.beginMutation("period-1");
    const settlement = Effect.runFork(
      revision.awaitMutationSettlement("period-1", sequence),
    );

    revision.completeMutation("period-1", sequence);

    await Effect.runPromise(Fiber.join(settlement));
    expect(revision.isMutationActive("period-1")).toBe(false);
  } finally {
    Object.defineProperty(Promise, "withResolvers", {
      configurable: true,
      value: originalWithResolvers,
      writable: true,
    });
  }
});
