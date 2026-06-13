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
  createDailyHistoryRepository,
  type DailyHistoryRecord,
  type DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import {
  createDailyTotalRepository,
  type DailyTotalRecord,
  type DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import { DayEntryService } from "$lib/server/services/day-entry-service";

export const DEFAULT_PERIOD_ID = "period-2026-04";
export const DEFAULT_DATE = "2026-04-20";

export type DayEntryFixture = {
  readonly databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  readonly budgetPeriodRepository: BudgetPeriodRepository;
  readonly dailyTotalRepository: DailyTotalRepository;
  readonly dailyHistoryRepository: DailyHistoryRepository;
  readonly service: DayEntryService;
};

type SeedPeriodInput = {
  readonly id?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly budgetYen?: number;
};

type PeriodScopedLookupInput = {
  readonly date?: string;
  readonly periodId?: string;
};

export async function createDayEntryFixture(): Promise<DayEntryFixture> {
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

export async function seedPeriod(
  fixture: DayEntryFixture,
  input: SeedPeriodInput = {},
): Promise<void> {
  await Effect.runPromise(
    fixture.budgetPeriodRepository.createPeriod({
      id: input.id ?? DEFAULT_PERIOD_ID,
      startDate: input.startDate ?? "2026-04-20",
      endDate: input.endDate ?? "2026-05-19",
      budgetYen: input.budgetYen ?? 100000,
      nowIso: "2026-04-01T00:00:00.000Z",
    }),
  );
}

export async function getDailyTotal(
  fixture: DayEntryFixture,
  input: PeriodScopedLookupInput = {},
): Promise<DailyTotalRecord | null> {
  return Effect.runPromise(
    fixture.databaseClient.read((tx) =>
      fixture.dailyTotalRepository.findByDate(
        tx,
        input.date ?? DEFAULT_DATE,
        input.periodId ?? DEFAULT_PERIOD_ID,
      ),
    ),
  );
}

export async function getHistories(
  fixture: DayEntryFixture,
  input: PeriodScopedLookupInput = {},
): Promise<DailyHistoryRecord[]> {
  return Effect.runPromise(
    fixture.databaseClient.read((tx) =>
      fixture.dailyHistoryRepository.listHistoriesByDate(
        tx,
        input.date ?? DEFAULT_DATE,
        input.periodId ?? DEFAULT_PERIOD_ID,
      ),
    ),
  );
}

export function oldestFirst(
  histories: readonly DailyHistoryRecord[],
): DailyHistoryRecord[] {
  return [...histories].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id.localeCompare(right.id);
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
}
