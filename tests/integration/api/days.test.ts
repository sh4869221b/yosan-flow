import { describe, expect, it } from "vitest";
import {
  createInMemoryDatabaseClient,
  type DatabaseClient
} from "$lib/server/db/client";
import {
  createTransactionalMonthRepository,
  type TransactionalMonthRepository,
  type MonthRecord
} from "$lib/server/db/month-repository";
import {
  createDailyTotalRepository,
  type DailyTotalRecord,
  type DailyTotalRepository
} from "$lib/server/db/daily-total-repository";
import {
  createDailyHistoryRepository,
  type DailyHistoryRecord,
  type DailyHistoryRepository
} from "$lib/server/db/daily-history-repository";
import { BudgetNotSetError, DayEntryService } from "$lib/server/services/day-entry-service";

type Fixture = {
  databaseClient: DatabaseClient<MonthRecord, DailyTotalRecord, DailyHistoryRecord>;
  monthRepository: TransactionalMonthRepository;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  service: DayEntryService;
};

async function createFixture(): Promise<Fixture> {
  let historyCounter = 0;
  const databaseClient = createInMemoryDatabaseClient<
    MonthRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >();
  const monthRepository = createTransactionalMonthRepository();
  const dailyTotalRepository = createDailyTotalRepository();
  const dailyHistoryRepository = createDailyHistoryRepository();
  const service = new DayEntryService({
    databaseClient,
    monthRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    now: () => "2026-04-18T00:00:00.000Z",
    createHistoryId: () => {
      historyCounter += 1;
      return `history-id-${historyCounter}`;
    }
  });

  return {
    databaseClient,
    monthRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    service
  };
}

async function seedBudget(
  fixture: Fixture,
  input: { yearMonth: string; budgetYen: number | null; budgetStatus: "set" | "unset" }
): Promise<void> {
  await fixture.databaseClient.transaction(async (tx) => {
    await fixture.monthRepository.createMonthIfAbsent(tx, {
      yearMonth: input.yearMonth,
      budgetYen: input.budgetYen,
      budgetStatus: input.budgetStatus,
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-04-01T00:00:00.000Z"
    });
  });
}

describe("day entry service", () => {
  it("adds to the day's total and records history", async () => {
    const fixture = await createFixture();
    await seedBudget(fixture, { yearMonth: "2026-04", budgetYen: 100000, budgetStatus: "set" });

    const response = await fixture.service.addDailyAmount({
      date: "2026-04-18",
      inputYen: 1000,
      memo: "lunch"
    });

    expect(response.dailyTotal.totalUsedYen).toBe(1000);
    expect(response.history.operationType).toBe("add");
    expect(response.history.beforeTotalYen).toBe(0);
    expect(response.history.afterTotalYen).toBe(1000);
    expect(response.history.memo).toBe("lunch");

    const persistedDailyTotal = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyTotalRepository.findByDate(tx, "2026-04-18");
    });
    const persistedHistories = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyHistoryRepository.listHistoriesByDate(tx, "2026-04-18");
    });
    expect(persistedDailyTotal?.totalUsedYen).toBe(1000);
    expect(persistedHistories).toHaveLength(1);
    expect(persistedHistories[0]).toMatchObject({
      operationType: "add",
      beforeTotalYen: 0,
      afterTotalYen: 1000,
      memo: "lunch"
    });
  });

  it("applies concurrent add operations without losing updates", async () => {
    const fixture = await createFixture();
    await seedBudget(fixture, { yearMonth: "2026-04", budgetYen: 100000, budgetStatus: "set" });

    await Promise.all([
      fixture.service.addDailyAmount({
        date: "2026-04-18",
        inputYen: 1000
      }),
      fixture.service.addDailyAmount({
        date: "2026-04-18",
        inputYen: 2000
      })
    ]);

    const dailyTotal = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyTotalRepository.findByDate(tx, "2026-04-18");
    });
    const histories = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyHistoryRepository.listHistoriesByDate(tx, "2026-04-18");
    });

    expect(dailyTotal?.totalUsedYen).toBe(3000);
    expect(histories).toHaveLength(2);
    expect(histories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationType: "add",
          beforeTotalYen: 0,
          afterTotalYen: 1000,
          inputYen: 1000
        }),
        expect.objectContaining({
          operationType: "add",
          beforeTotalYen: 1000,
          afterTotalYen: 3000,
          inputYen: 2000
        })
      ])
    );
  });

  it("overwrites the day's total atomically", async () => {
    const fixture = await createFixture();
    await seedBudget(fixture, { yearMonth: "2026-04", budgetYen: 100000, budgetStatus: "set" });

    await fixture.service.addDailyAmount({
      date: "2026-04-18",
      inputYen: 1000
    });
    const response = await fixture.service.overwriteDailyAmount({
      date: "2026-04-18",
      inputYen: 3000
    });

    expect(response.dailyTotal.totalUsedYen).toBe(3000);
    expect(response.history.operationType).toBe("overwrite");
    expect(response.history.beforeTotalYen).toBe(1000);
    expect(response.history.afterTotalYen).toBe(3000);
  });

  it("rejects day updates when month budget is unset", async () => {
    const fixture = await createFixture();
    await seedBudget(fixture, { yearMonth: "2026-04", budgetYen: null, budgetStatus: "unset" });

    await expect(
      fixture.service.addDailyAmount({
        date: "2026-04-18",
        inputYen: 1000
      })
    ).rejects.toBeInstanceOf(BudgetNotSetError);
  });

  it("rolls back daily_totals when history insert fails", async () => {
    const fixture = await createFixture();
    await seedBudget(fixture, { yearMonth: "2026-04", budgetYen: 100000, budgetStatus: "set" });

    const failingService = new DayEntryService({
      databaseClient: fixture.databaseClient,
      monthRepository: fixture.monthRepository,
      dailyTotalRepository: fixture.dailyTotalRepository,
      dailyHistoryRepository: {
        ...fixture.dailyHistoryRepository,
        async insertHistory() {
          throw new Error("insert failed");
        }
      }
    });

    await expect(
      failingService.addDailyAmount({
        date: "2026-04-18",
        inputYen: 1000
      })
    ).rejects.toThrow("insert failed");

    const dailyTotal = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyTotalRepository.findByDate(tx, "2026-04-18");
    });
    const histories = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyHistoryRepository.listHistoriesByDate(tx, "2026-04-18");
    });
    expect(dailyTotal).toBeNull();
    expect(histories).toHaveLength(0);
  });
});
