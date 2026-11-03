import { Deferred, Effect, Fiber, Result } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryApiServices } from "#lib/server/services/api-services/in-memory.ts";
import { getPeriodSummaryFromServices } from "#lib/server/services/month-summary-service.ts";
import {
  buildPeriodSummary,
  PeriodNotFoundError,
} from "#lib/server/services/period-summary/period-summary-calculator.ts";

async function fixture() {
  const services = createInMemoryApiServices({
    now: () => new Date("2026-04-20T00:00:00Z"),
  });
  const period = await Effect.runPromise(
    services.createPeriod({
      id: "selected",
      startDate: "2026-04-18",
      endDate: "2026-05-17",
      budgetYen: 30000,
    }),
  );
  const totals = [
    { budgetPeriodId: period.id, date: "2026-04-19", totalUsedYen: 1000 },
    { budgetPeriodId: period.id, date: "2026-04-20", totalUsedYen: 500 },
    { budgetPeriodId: "other", date: "2026-04-20", totalUsedYen: 9000 },
    { budgetPeriodId: period.id, date: "2026-05-18", totalUsedYen: 8000 },
  ];
  return { services, period, totals };
}

function pending<A>() {
  const started = Promise.withResolvers<void>();
  const gate = Effect.runSync(Deferred.make<A, Error>());
  const finalized = vi.fn();
  const effect = Effect.sync(() => started.resolve()).pipe(
    Effect.andThen(Deferred.await(gate)),
    Effect.ensuring(Effect.sync(finalized)),
  );
  return { effect, started: started.promise, gate, finalized };
}

describe("period summary loading", () => {
  it.each(["period", "totals"] as const)(
    "starts both scoped reads before either finishes (%s resolves first)",
    async (first) => {
      const { services, period, totals } = await fixture();
      const expected = await Effect.runPromise(
        buildPeriodSummary(services.budgetPeriodRepository, period.id, {
          jstToday: services.jstToday(),
          dailyTotals: totals,
        }),
      );
      const periodRead = pending<typeof period | null>();
      const totalsRead = pending<typeof totals>();
      const find = vi
        .spyOn(services.budgetPeriodRepository, "findById")
        .mockReturnValue(periodRead.effect);
      const list = vi
        .spyOn(services, "listDailyTotalsByPeriodId")
        .mockReturnValue(totalsRead.effect);
      const today = vi.spyOn(services, "jstToday");
      const effect = getPeriodSummaryFromServices(services, period.id);
      expect(find).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      const fiber = Effect.runFork(effect);
      try {
        await Promise.all([periodRead.started, totalsRead.started]);
        expect(find).toHaveBeenCalledExactlyOnceWith(period.id);
        expect(list).toHaveBeenCalledExactlyOnceWith(period.id);
        expect(today).not.toHaveBeenCalled();
        if (first === "period") {
          Effect.runSync(Deferred.succeed(periodRead.gate, period));
          await vi.waitFor(() =>
            expect(periodRead.finalized).toHaveBeenCalledOnce(),
          );
        } else {
          Effect.runSync(Deferred.succeed(totalsRead.gate, totals));
          await vi.waitFor(() =>
            expect(totalsRead.finalized).toHaveBeenCalledOnce(),
          );
        }
        expect(fiber.pollUnsafe()).toBeUndefined();
        Effect.runSync(Deferred.succeed(periodRead.gate, period));
        Effect.runSync(Deferred.succeed(totalsRead.gate, totals));
        expect(await Effect.runPromise(Fiber.join(fiber))).toEqual(expected);
        expect(today).toHaveBeenCalledOnce();
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber));
      }
    },
  );

  it("returns a totals failure without waiting for the period read and cancels it", async () => {
    const { services, period, totals } = await fixture();
    const periodRead = pending<typeof period | null>();
    const totalsRead = pending<typeof totals>();
    services.budgetPeriodRepository.findById = () => periodRead.effect;
    services.listDailyTotalsByPeriodId = () => totalsRead.effect;
    const today = vi.spyOn(services, "jstToday");
    const error = new Error("totals failed");
    const result = Effect.runPromise(
      Effect.result(getPeriodSummaryFromServices(services, period.id)),
    );
    await Promise.all([periodRead.started, totalsRead.started]);
    Effect.runSync(Deferred.fail(totalsRead.gate, error));
    expect(await result).toMatchObject({ failure: error });
    expect(periodRead.finalized).toHaveBeenCalledOnce();
    expect(today).not.toHaveBeenCalled();
  });

  it.each([null, new Error("period failed")])(
    "preserves totals error precedence when period read returns %s",
    async (periodResult) => {
      const { services, period } = await fixture();
      const error = new Error("totals failed");
      services.listDailyTotalsByPeriodId = () => Effect.fail(error);
      services.budgetPeriodRepository.findById = () =>
        periodResult === null
          ? Effect.succeed(null)
          : Effect.fail(periodResult);
      expect(
        await Effect.runPromise(
          Effect.result(getPeriodSummaryFromServices(services, period.id)),
        ),
      ).toMatchObject({ failure: error });
    },
  );

  it("preserves missing-period code and period read errors after totals succeed", async () => {
    const { services, period } = await fixture();
    services.budgetPeriodRepository.findById = () => Effect.succeed(null);
    const missing = await Effect.runPromise(
      Effect.result(getPeriodSummaryFromServices(services, period.id)),
    );
    expect(new PeriodNotFoundError(period.id).code).toBe("PERIOD_NOT_FOUND");
    expect(Result.isFailure(missing)).toBe(true);
    if (Result.isFailure(missing)) {
      expect(missing.failure).toBeInstanceOf(PeriodNotFoundError);
      if (missing.failure instanceof PeriodNotFoundError) {
        expect(missing.failure.code).toBe("PERIOD_NOT_FOUND");
        expect(missing.failure.message).toBe(`Period not found: ${period.id}`);
      }
    }
    const error = new Error("period failed");
    services.budgetPeriodRepository.findById = () => Effect.fail(error);
    expect(
      await Effect.runPromise(
        Effect.result(getPeriodSummaryFromServices(services, period.id)),
      ),
    ).toMatchObject({ failure: error });
  });

  it("finalizes both reads when the summary is interrupted", async () => {
    const { services, period, totals } = await fixture();
    const periodRead = pending<typeof period | null>();
    const totalsRead = pending<typeof totals>();
    services.budgetPeriodRepository.findById = () => periodRead.effect;
    services.listDailyTotalsByPeriodId = () => totalsRead.effect;
    const fiber = Effect.runFork(
      getPeriodSummaryFromServices(services, period.id),
    );
    await Promise.all([periodRead.started, totalsRead.started]);
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(periodRead.finalized).toHaveBeenCalledOnce();
    expect(totalsRead.finalized).toHaveBeenCalledOnce();
  });
});
