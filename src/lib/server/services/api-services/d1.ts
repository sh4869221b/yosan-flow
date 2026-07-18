import { Effect } from "effect";
import type { D1Database } from "$lib/server/db/d1-types";
import { createHistoryId as createDefaultHistoryId } from "$lib/server/services/history-id";
import { getJstDateParts } from "$lib/server/time/jst-format";
import { createPeriodUpdateService } from "$lib/server/services/period-update/period-update-service";
import { createD1DayEntryService } from "./day-entry-command-service";
import {
  assertNoOutOfRangePeriodEntries,
  createD1ApiServiceRepositories,
} from "./repositories";
import {
  listPeriodDailyTotals,
  listPeriodHistoryByDate,
} from "./result-mappers";
import type {
  CreateInMemoryApiServicesInput,
  InMemoryApiServices,
} from "./types";

export function createD1ApiServices(
  db: D1Database,
  input: CreateInMemoryApiServicesInput = {},
): InMemoryApiServices {
  const now = input.now ?? (() => new Date());
  const repositories = createD1ApiServiceRepositories(db);
  const { budgetPeriodRepository, dailyTotalRepository } = repositories;
  const dayEntryService = createD1DayEntryService({
    dailyHistoryRepository: repositories.dailyHistoryRepository,
    budgetPeriodRepository,
    dayEntryWriter: repositories.dayEntryWriter,
    now,
    createHistoryId: input.createHistoryId ?? createDefaultHistoryId,
  });
  const updateOrdinary = (periodInput: {
    readonly id: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly budgetYen: number;
  }) =>
    Effect.gen(function* () {
      yield* assertNoOutOfRangePeriodEntries(
        repositories,
        periodInput.id,
        periodInput.startDate,
        periodInput.endDate,
      );
      return yield* budgetPeriodRepository.updatePeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      });
    });
  const updatePeriod = createPeriodUpdateService({
    budgetPeriodRepository,
    updateOrdinary,
    assertNoOutOfRangeEntries: (periodId, startDate, endDate) =>
      assertNoOutOfRangePeriodEntries(
        repositories,
        periodId,
        startDate,
        endDate,
      ),
    nowIso: () => now().toISOString(),
  });

  return {
    budgetPeriodRepository,
    dayEntryService,
    createPeriod: (periodInput) =>
      budgetPeriodRepository.createPeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      }),
    updatePeriod,
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: (periodId) =>
      listPeriodDailyTotals(dailyTotalRepository, periodId),
    listHistoryByDate: (periodId, date) =>
      listPeriodHistoryByDate(repositories, periodId, date),
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
  };
}
