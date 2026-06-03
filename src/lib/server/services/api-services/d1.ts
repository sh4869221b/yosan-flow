import { Effect } from "effect";
import type { D1Database } from "$lib/server/db/d1-types";
import {
  createD1DayEntryWriter,
  type D1DayEntryWriter,
} from "$lib/server/db/day-entry-writer";
import {
  createD1BudgetPeriodRepository,
  PeriodValidationError,
  type BudgetPeriodRecord,
  type BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import {
  createD1DailyHistoryRepository,
  type D1DailyHistoryRepository,
  type DailyHistoryRecord,
} from "$lib/server/db/daily-history-repository";
import { createD1DailyTotalRepository } from "$lib/server/db/daily-total-repository";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { toEffectError } from "$lib/server/effect/runtime";
import { HistoryNotFoundError } from "$lib/server/services/day-entry-service";
import { createHistoryId as createDefaultHistoryId } from "$lib/server/services/history-id";
import { getJstDateParts } from "$lib/server/time/jst";
import type {
  CreateInMemoryApiServicesInput,
  DayEntryServicePort,
  InMemoryApiServices,
} from "./types";
import { DateOutOfPeriodError, PeriodNotFoundError } from "./types";

function createD1DayEntryService(
  dailyHistoryRepository: D1DailyHistoryRepository,
  budgetPeriodRepository: BudgetPeriodRepository,
  dayEntryWriter: D1DayEntryWriter,
  now: () => Date,
  createHistoryId: () => string,
): DayEntryServicePort {
  function validatePeriodDate(
    periodId: string,
    date: string,
  ): Effect.Effect<BudgetPeriodRecord, Error> {
    return Effect.gen(function* () {
      yield* Effect.try({
        try: () => {
          assertValidDate(date);
        },
        catch: toEffectError,
      });

      const period = yield* budgetPeriodRepository.findById(periodId);
      if (!period) {
        return yield* Effect.fail(new PeriodNotFoundError(periodId));
      }
      if (!isDateWithinPeriod(date, period.startDate, period.endDate)) {
        return yield* Effect.fail(new DateOutOfPeriodError(date, periodId));
      }
      return period;
    });
  }

  function execute(
    command: {
      periodId: string;
      date: string;
      inputYen: number;
      memo?: string | null;
    },
    operationType: "add" | "overwrite",
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      yield* Effect.try({
        try: () => {
          assertValidDate(command.date);
          assertValidInputYen(command.inputYen);
        },
        catch: toEffectError,
      });

      yield* validatePeriodDate(command.periodId, command.date);

      const nowIso = now().toISOString();
      const memo = normalizeMemo(command.memo);
      yield* dayEntryWriter.writeDailyEntry({
        total: {
          budgetPeriodId: command.periodId,
          date: command.date,
          yearMonth: command.date.slice(0, 7),
          totalUsedYen: command.inputYen,
          nowIso,
        },
        history: {
          id: createHistoryId(),
          budgetPeriodId: command.periodId,
          date: command.date,
          operationType,
          inputYen: command.inputYen,
          beforeTotalYen: 0,
          afterTotalYen: command.inputYen,
          memo,
          createdAt: nowIso,
        },
        mode: operationType,
      });
      return {};
    });
  }

  function replayHistoryMutation(
    command: {
      periodId: string;
      date: string;
      historyId: string;
    },
    mutateTarget: (history: DailyHistoryRecord) =>
      | {
          kind: "update";
          inputYen: number;
          memo: string | null;
        }
      | { kind: "delete" },
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      yield* validatePeriodDate(command.periodId, command.date);
      const histories = yield* dailyHistoryRepository.listHistoriesByDate(
        command.date,
        command.periodId,
      );
      const target = histories.find(
        (history) => history.id === command.historyId,
      );
      if (!target) {
        return yield* Effect.fail(new HistoryNotFoundError(command.historyId));
      }

      const mutation = mutateTarget(target);
      if (mutation.kind === "update") {
        yield* dayEntryWriter.writeHistoryReplay({
          kind: "update",
          budgetPeriodId: command.periodId,
          date: command.date,
          yearMonth: command.date.slice(0, 7),
          nowIso: now().toISOString(),
          historyId: command.historyId,
          inputYen: mutation.inputYen,
          memo: mutation.memo,
        });
      } else {
        yield* dayEntryWriter.writeHistoryReplay({
          kind: "delete",
          budgetPeriodId: command.periodId,
          date: command.date,
          yearMonth: command.date.slice(0, 7),
          nowIso: now().toISOString(),
          historyId: command.historyId,
        });
      }
      return {};
    });
  }

  return {
    addDailyAmount: (command) => execute(command, "add"),
    overwriteDailyAmount: (command) => execute(command, "overwrite"),
    updateHistoryEntry: (command) =>
      Effect.gen(function* () {
        const memo = yield* Effect.try({
          try: () => {
            assertValidInputYen(command.inputYen);
            return normalizeMemo(command.memo);
          },
          catch: toEffectError,
        });
        return yield* replayHistoryMutation(command, () => ({
          kind: "update",
          inputYen: command.inputYen,
          memo,
        }));
      }),
    deleteHistoryEntry: (command) =>
      replayHistoryMutation(command, () => ({ kind: "delete" })),
  };
}

export function createD1ApiServices(
  db: D1Database,
  input: CreateInMemoryApiServicesInput = {},
): InMemoryApiServices {
  const now = input.now ?? (() => new Date());
  const budgetPeriodRepository = createD1BudgetPeriodRepository({
    db,
  });
  const dailyTotalRepository = createD1DailyTotalRepository({
    db,
  });
  const dailyHistoryRepository = createD1DailyHistoryRepository({
    db,
  });
  const dayEntryWriter = createD1DayEntryWriter({
    db,
  });
  const dayEntryService = createD1DayEntryService(
    dailyHistoryRepository,
    budgetPeriodRepository,
    dayEntryWriter,
    now,
    input.createHistoryId ?? createDefaultHistoryId,
  );

  function assertNoOutOfRangePeriodEntries(
    periodId: string,
    startDate: string,
    endDate: string,
  ): Effect.Effect<void, Error> {
    return Effect.gen(function* () {
      const outOfRangeTotal =
        yield* dailyTotalRepository.hasEntriesOutsidePeriod(
          periodId,
          startDate,
          endDate,
        );
      const outOfRangeHistory =
        yield* dailyHistoryRepository.hasEntriesOutsidePeriod(
          periodId,
          startDate,
          endDate,
        );

      if (outOfRangeTotal || outOfRangeHistory) {
        return yield* Effect.fail(
          new PeriodValidationError(
            "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
            `period ${periodId} has entries outside the updated range`,
          ),
        );
      }
    });
  }

  return {
    budgetPeriodRepository,
    dayEntryService,
    createPeriod: (periodInput) =>
      budgetPeriodRepository.createPeriod({
        ...periodInput,
        nowIso: now().toISOString(),
      }),
    updatePeriod: (periodInput) =>
      Effect.gen(function* () {
        yield* assertNoOutOfRangePeriodEntries(
          periodInput.id,
          periodInput.startDate,
          periodInput.endDate,
        );
        return yield* budgetPeriodRepository.updatePeriod({
          ...periodInput,
          nowIso: now().toISOString(),
        });
      }),
    listPeriods: () => budgetPeriodRepository.listPeriods(),
    listDailyTotalsByPeriodId: (periodId) =>
      dailyTotalRepository.listByPeriodId(periodId).pipe(
        Effect.map((rows) =>
          rows.map((row) => ({
            date: row.date,
            budgetPeriodId: row.budgetPeriodId,
            totalUsedYen: row.totalUsedYen,
          })),
        ),
      ),
    listHistoryByDate: (periodId, date) =>
      Effect.gen(function* () {
        const period = yield* budgetPeriodRepository.findById(periodId);
        if (!period) {
          return yield* Effect.fail(new PeriodNotFoundError(periodId));
        }
        return yield* dailyHistoryRepository.listHistoriesByDate(
          date,
          periodId,
        );
      }),
    nowIso: () => now().toISOString(),
    jstToday: () => getJstDateParts(now()).date,
  };
}
