import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { HistoryNotFoundError } from "$lib/server/services/day-entry-service";
import {
  DEFAULT_DATE,
  DEFAULT_PERIOD_ID,
  createDayEntryFixture,
  getDailyTotal,
  getHistories,
  oldestFirst,
  seedPeriod,
} from "./day-entry-fixture";

describe("day entry history replay workflows", () => {
  it("edits a history row and replays later rows", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
        memo: "first",
      }),
    );
    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 2000,
        memo: "second",
      }),
    );

    await Effect.runPromise(
      fixture.service.updateHistoryEntry({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        historyId: "history-id-1",
        inputYen: 1500,
        memo: "first edited",
      }),
    );

    const persistedDailyTotal = await getDailyTotal(fixture);
    const histories = oldestFirst(await getHistories(fixture));
    expect(persistedDailyTotal?.totalUsedYen).toBe(3500);
    expect(histories).toMatchObject([
      {
        id: "history-id-1",
        inputYen: 1500,
        beforeTotalYen: 0,
        afterTotalYen: 1500,
        memo: "first edited",
      },
      {
        id: "history-id-2",
        inputYen: 2000,
        beforeTotalYen: 1500,
        afterTotalYen: 3500,
        memo: "second",
      },
    ]);
  });

  it("deletes a middle history row and replays the remaining chain", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    for (const inputYen of [1000, 2000, 3000]) {
      await Effect.runPromise(
        fixture.service.addDailyAmount({
          periodId: DEFAULT_PERIOD_ID,
          date: DEFAULT_DATE,
          inputYen,
        }),
      );
    }

    await Effect.runPromise(
      fixture.service.deleteHistoryEntry({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        historyId: "history-id-2",
      }),
    );

    const persistedDailyTotal = await getDailyTotal(fixture);
    const histories = oldestFirst(await getHistories(fixture));
    expect(persistedDailyTotal?.totalUsedYen).toBe(4000);
    expect(histories).toMatchObject([
      {
        id: "history-id-1",
        inputYen: 1000,
        beforeTotalYen: 0,
        afterTotalYen: 1000,
      },
      {
        id: "history-id-3",
        inputYen: 3000,
        beforeTotalYen: 1000,
        afterTotalYen: 4000,
      },
    ]);
  });

  it("preserves overwrite semantics while replaying history edits", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
      }),
    );
    await Effect.runPromise(
      fixture.service.overwriteDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 500,
      }),
    );
    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 200,
      }),
    );

    await Effect.runPromise(
      fixture.service.updateHistoryEntry({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        historyId: "history-id-2",
        inputYen: 700,
      }),
    );

    const persistedDailyTotal = await getDailyTotal(fixture);
    const histories = oldestFirst(await getHistories(fixture));
    expect(persistedDailyTotal?.totalUsedYen).toBe(900);
    expect(histories).toMatchObject([
      { id: "history-id-1", afterTotalYen: 1000 },
      {
        id: "history-id-2",
        operationType: "overwrite",
        inputYen: 700,
        beforeTotalYen: 1000,
        afterTotalYen: 700,
      },
      {
        id: "history-id-3",
        operationType: "add",
        beforeTotalYen: 700,
        afterTotalYen: 900,
      },
    ]);
  });

  it("deletes the last history row and clears the day's total", async () => {
    const fixture = await createDayEntryFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 1000,
      }),
    );

    await Effect.runPromise(
      fixture.service.deleteHistoryEntry({
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        historyId: "history-id-1",
      }),
    );

    const persistedDailyTotal = await getDailyTotal(fixture);
    const histories = await getHistories(fixture);
    expect(histories).toHaveLength(0);
    expect(persistedDailyTotal?.totalUsedYen ?? 0).toBe(0);
  });

  it("rejects history updates scoped to another budget period", async () => {
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

    const error = await Effect.runPromise(
      Effect.flip(
        fixture.service.updateHistoryEntry({
          periodId: DEFAULT_PERIOD_ID,
          date: DEFAULT_DATE,
          historyId: "history-id-2",
          inputYen: 3000,
        }),
      ),
    );

    const primaryTotal = await getDailyTotal(fixture);
    const secondaryTotal = await getDailyTotal(fixture, {
      periodId: "period-2026-05",
      date: "2026-05-20",
    });
    expect(error).toBeInstanceOf(HistoryNotFoundError);
    expect(primaryTotal?.totalUsedYen).toBe(1000);
    expect(secondaryTotal?.totalUsedYen).toBe(2500);
  });
});
