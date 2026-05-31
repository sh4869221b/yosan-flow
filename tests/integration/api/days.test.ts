import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  createInMemoryDatabaseClient,
  type DatabaseClient,
} from "$lib/server/db/client";
import {
  createInMemoryBudgetPeriodRepository,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import {
  createDailyTotalRepository,
  type DailyTotalRecord,
  type DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import {
  createDailyHistoryRepository,
  type DailyHistoryRecord,
  type DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  DateOutOfPeriodError,
  DayEntryService,
  PeriodNotFoundError,
} from "$lib/server/services/day-entry-service";

type Fixture = {
  databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  budgetPeriodRepository: BudgetPeriodRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  service: DayEntryService;
};

async function createFixture(): Promise<Fixture> {
  let historyCounter = 0;
  const databaseClient = createInMemoryDatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >();
  const budgetPeriodRepository = createInMemoryBudgetPeriodRepository();
  const dailyTotalRepository = createDailyTotalRepository();
  const dailyHistoryRepository = createDailyHistoryRepository();
  const service = new DayEntryService({
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => "2026-04-18T00:00:00.000Z",
    createHistoryId: () => {
      historyCounter += 1;
      return `history-id-${historyCounter}`;
    },
  });

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    service,
  };
}

async function seedPeriod(fixture: Fixture): Promise<void> {
  await Effect.runPromise(
    fixture.budgetPeriodRepository.createPeriod({
      id: "period-2026-04",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 100000,
      nowIso: "2026-04-01T00:00:00.000Z",
    }),
  );
}

async function getDailyTotal(
  fixture: Fixture,
  date = "2026-04-20",
): Promise<DailyTotalRecord | null> {
  return Effect.runPromise(
    fixture.databaseClient.read((tx) =>
      fixture.dailyTotalRepository.findByDate(tx, date, "period-2026-04"),
    ),
  );
}

async function getHistories(
  fixture: Fixture,
  date = "2026-04-20",
): Promise<DailyHistoryRecord[]> {
  return Effect.runPromise(
    fixture.databaseClient.read((tx) =>
      fixture.dailyHistoryRepository.listHistoriesByDate(
        tx,
        date,
        "period-2026-04",
      ),
    ),
  );
}

function oldestFirst(histories: DailyHistoryRecord[]): DailyHistoryRecord[] {
  return [...histories].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id);
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}

describe("day entry service", () => {
  it("adds to the day's total and records history", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    const response = await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 1000,
        memo: "lunch",
      }),
    );

    expect(response.dailyTotal.totalUsedYen).toBe(1000);
    expect(response.history.operationType).toBe("add");
    expect(response.history.beforeTotalYen).toBe(0);
    expect(response.history.afterTotalYen).toBe(1000);
    expect(response.history.memo).toBe("lunch");

    const persistedDailyTotal = await Effect.runPromise(
      fixture.databaseClient.read((tx) =>
        fixture.dailyTotalRepository.findByDate(
          tx,
          "2026-04-20",
          "period-2026-04",
        ),
      ),
    );
    const persistedHistories = await Effect.runPromise(
      fixture.databaseClient.read((tx) =>
        fixture.dailyHistoryRepository.listHistoriesByDate(
          tx,
          "2026-04-20",
          "period-2026-04",
        ),
      ),
    );
    expect(persistedDailyTotal?.totalUsedYen).toBe(1000);
    expect(persistedHistories).toHaveLength(1);
  });

  it("rejects updates when period does not exist", async () => {
    const fixture = await createFixture();

    const error = await Effect.runPromise(
      Effect.flip(
        fixture.service.addDailyAmount({
          periodId: "missing",
          date: "2026-04-20",
          inputYen: 1000,
        }),
      ),
    );

    expect(error).toBeInstanceOf(PeriodNotFoundError);
  });

  it("rejects through the API Effect runner with the original service error", async () => {
    const fixture = await createFixture();

    await expect(
      runApiEffect(
        fixture.service.addDailyAmount({
          periodId: "missing",
          date: "2026-04-20",
          inputYen: 1000,
        }),
      ),
    ).rejects.toBeInstanceOf(PeriodNotFoundError);
  });

  it("rejects dates outside the selected period", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    const error = await Effect.runPromise(
      Effect.flip(
        fixture.service.addDailyAmount({
          periodId: "period-2026-04",
          date: "2026-04-19",
          inputYen: 1000,
        }),
      ),
    );

    expect(error).toBeInstanceOf(DateOutOfPeriodError);
  });

  it("overwrites the day's total atomically", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );
    const response = await Effect.runPromise(
      fixture.service.overwriteDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 3000,
      }),
    );

    expect(response.dailyTotal.totalUsedYen).toBe(3000);
    expect(response.history.operationType).toBe("overwrite");
    expect(response.history.beforeTotalYen).toBe(1000);
    expect(response.history.afterTotalYen).toBe(3000);
  });

  it("edits a history row and replays later rows", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 1000,
        memo: "first",
      }),
    );
    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 2000,
        memo: "second",
      }),
    );

    await Effect.runPromise(
      fixture.service.updateHistoryEntry({
        periodId: "period-2026-04",
        date: "2026-04-20",
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
    const fixture = await createFixture();
    await seedPeriod(fixture);

    for (const inputYen of [1000, 2000, 3000]) {
      await Effect.runPromise(
        fixture.service.addDailyAmount({
          periodId: "period-2026-04",
          date: "2026-04-20",
          inputYen,
        }),
      );
    }

    await Effect.runPromise(
      fixture.service.deleteHistoryEntry({
        periodId: "period-2026-04",
        date: "2026-04-20",
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
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );
    await Effect.runPromise(
      fixture.service.overwriteDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 500,
      }),
    );
    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 200,
      }),
    );

    await Effect.runPromise(
      fixture.service.updateHistoryEntry({
        periodId: "period-2026-04",
        date: "2026-04-20",
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
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await Effect.runPromise(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-20",
        inputYen: 1000,
      }),
    );

    await Effect.runPromise(
      fixture.service.deleteHistoryEntry({
        periodId: "period-2026-04",
        date: "2026-04-20",
        historyId: "history-id-1",
      }),
    );

    const persistedDailyTotal = await getDailyTotal(fixture);
    const histories = await getHistories(fixture);
    expect(histories).toHaveLength(0);
    expect(persistedDailyTotal?.totalUsedYen ?? 0).toBe(0);
  });
});
