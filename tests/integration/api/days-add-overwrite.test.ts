import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  DateOutOfPeriodError,
  PeriodNotFoundError,
} from "$lib/server/services/day-entry-service";
import {
  DEFAULT_DATE,
  DEFAULT_PERIOD_ID,
  createDayEntryFixture,
  getDailyTotal,
  getHistories,
  seedPeriod,
} from "./day-entry-fixture";

describe("day entry add and overwrite workflows", () => {
  it("adds to the day's total and records history", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    const response = await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
        memo: "lunch",
      }),
    );

    expect(response.dailyTotal.totalUsedYen).toBe(1000);
    expect(response.history.operationType).toBe("add");
    expect(response.history.beforeTotalYen).toBe(0);
    expect(response.history.afterTotalYen).toBe(1000);
    expect(response.history.memo).toBe("lunch");

    const persistedDailyTotal = await getDailyTotal(fixture);
    const persistedHistories = await getHistories(fixture);
    expect(persistedDailyTotal?.totalUsedYen).toBe(1000);
    expect(persistedHistories).toHaveLength(1);
  });

  it("rejects updates when period does not exist", async () => {
    const fixture = await createDayEntryFixture();

    const error = await Effect.runPromise(
      Effect.flip(
        fixture.service.addDailyAmount({
          periodId: "missing",
          date: DEFAULT_DATE,
          inputYen: 1000,
        }),
      ),
    );

    expect(error).toBeInstanceOf(PeriodNotFoundError);
  });

  it("rejects through the API Effect runner with the original service error", async () => {
    const fixture = await createDayEntryFixture();

    await expect(
      runApiEffect(
        fixture.service.addDailyAmount({
          periodId: "missing",
          date: DEFAULT_DATE,
          inputYen: 1000,
        }),
      ),
    ).rejects.toBeInstanceOf(PeriodNotFoundError);
  });

  it("rejects dates outside the selected period", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    const error = await Effect.runPromise(
      Effect.flip(
        fixture.service.addDailyAmount({
          periodId: DEFAULT_PERIOD_ID,
          date: "2026-04-19",
          inputYen: 1000,
        }),
      ),
    );

    expect(error).toBeInstanceOf(DateOutOfPeriodError);
  });

  it("overwrites the day's total atomically", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
      }),
    );
    const response = await Effect.runPromise(
      fixture.service.overwriteDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 3000,
      }),
    );

    expect(response.dailyTotal.totalUsedYen).toBe(3000);
    expect(response.history.operationType).toBe("overwrite");
    expect(response.history.beforeTotalYen).toBe(1000);
    expect(response.history.afterTotalYen).toBe(3000);
  });

  it("keeps totals scoped by budget period", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);
    await seedPeriod(fixture, {
      id: "period-2026-05",
      startDate: "2026-05-20",
      endDate: "2026-06-19",
    });

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
      }),
    );
    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-05",
        date: "2026-05-20",
        inputYen: 2500,
      }),
    );
    await Effect.runPromise(
      fixture.service.overwriteDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 3000,
      }),
    );

    const primaryTotal = await getDailyTotal(fixture);
    const secondaryTotal = await getDailyTotal(fixture, {
      periodId: "period-2026-05",
      date: "2026-05-20",
    });
    expect(primaryTotal?.totalUsedYen).toBe(3000);
    expect(secondaryTotal?.totalUsedYen).toBe(2500);
  });
});
