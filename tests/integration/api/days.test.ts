import { describe, expect, it } from "vitest";
import { createInMemoryDatabaseClient, type DatabaseClient } from "$lib/server/db/client";
import {
  createInMemoryBudgetPeriodRepository,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository
} from "$lib/server/db/budget-period-repository";
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
import {
  DateOutOfPeriodError,
  DayEntryService,
  PeriodNotFoundError
} from "$lib/server/services/day-entry-service";

type Fixture = {
  databaseClient: DatabaseClient<BudgetPeriodRecord, DailyTotalRecord, DailyHistoryRecord>;
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
    }
  });

  return {
    databaseClient,
    budgetPeriodRepository,
    dailyTotalRepository,
    dailyHistoryRepository,
    service
  };
}

async function seedPeriod(fixture: Fixture): Promise<void> {
  await fixture.budgetPeriodRepository.createPeriod({
    id: "period-2026-04",
    startDate: "2026-04-20",
    endDate: "2026-05-19",
    budgetYen: 100000,
    nowIso: "2026-04-01T00:00:00.000Z"
  });
}

describe("day entry service", () => {
  it("adds to the day's total and records history", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    const response = await fixture.service.addDailyAmount({
      periodId: "period-2026-04",
      date: "2026-04-20",
      inputYen: 1000,
      memo: "lunch"
    });

    expect(response.dailyTotal.totalUsedYen).toBe(1000);
    expect(response.history.operationType).toBe("add");
    expect(response.history.beforeTotalYen).toBe(0);
    expect(response.history.afterTotalYen).toBe(1000);
    expect(response.history.memo).toBe("lunch");

    const persistedDailyTotal = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyTotalRepository.findByDate(tx, "2026-04-20", "period-2026-04");
    });
    const persistedHistories = await fixture.databaseClient.read(async (tx) => {
      return fixture.dailyHistoryRepository.listHistoriesByDate(tx, "2026-04-20", "period-2026-04");
    });
    expect(persistedDailyTotal?.totalUsedYen).toBe(1000);
    expect(persistedHistories).toHaveLength(1);
  });

  it("rejects updates when period does not exist", async () => {
    const fixture = await createFixture();

    await expect(
      fixture.service.addDailyAmount({
        periodId: "missing",
        date: "2026-04-20",
        inputYen: 1000
      })
    ).rejects.toBeInstanceOf(PeriodNotFoundError);
  });

  it("rejects dates outside the selected period", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await expect(
      fixture.service.addDailyAmount({
        periodId: "period-2026-04",
        date: "2026-04-19",
        inputYen: 1000
      })
    ).rejects.toBeInstanceOf(DateOutOfPeriodError);
  });

  it("overwrites the day's total atomically", async () => {
    const fixture = await createFixture();
    await seedPeriod(fixture);

    await fixture.service.addDailyAmount({
      periodId: "period-2026-04",
      date: "2026-04-20",
      inputYen: 1000
    });
    const response = await fixture.service.overwriteDailyAmount({
      periodId: "period-2026-04",
      date: "2026-04-20",
      inputYen: 3000
    });

    expect(response.dailyTotal.totalUsedYen).toBe(3000);
    expect(response.history.operationType).toBe("overwrite");
    expect(response.history.beforeTotalYen).toBe(1000);
    expect(response.history.afterTotalYen).toBe(3000);
  });
});
