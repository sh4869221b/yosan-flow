import { Effect } from "effect";
import type { D1DayEntryWriter } from "$lib/server/db/day-entry-writer";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "$lib/server/db/budget-period-repository";
import type {
  D1DailyHistoryRepository,
  DailyHistoryRecord,
} from "$lib/server/db/daily-history-repository";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "$lib/server/domain/daily-entry";
import { isDateWithinPeriod } from "$lib/server/domain/budget-period";
import { toEffectError } from "$lib/server/effect/runtime";
import { HistoryNotFoundError } from "$lib/server/services/day-entry-service";
import type { DayEntryServicePort } from "./types";
import { DateOutOfPeriodError, PeriodNotFoundError } from "./types";

type DayEntryCommand = {
  readonly periodId: string;
  readonly date: string;
  readonly inputYen: number;
  readonly memo?: string | null;
};

type HistoryReplayCommand = {
  readonly periodId: string;
  readonly date: string;
  readonly historyId: string;
};

type HistoryMutation =
  | {
      readonly kind: "update";
      readonly inputYen: number;
      readonly memo: string | null;
    }
  | { readonly kind: "delete" };

type CreateD1DayEntryServiceInput = {
  readonly dailyHistoryRepository: D1DailyHistoryRepository;
  readonly budgetPeriodRepository: BudgetPeriodRepository;
  readonly dayEntryWriter: D1DayEntryWriter;
  readonly now: () => Date;
  readonly createHistoryId: () => string;
};

function validatePeriodDate(
  budgetPeriodRepository: BudgetPeriodRepository,
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

export function createD1DayEntryService(
  input: CreateD1DayEntryServiceInput,
): DayEntryServicePort {
  const {
    dailyHistoryRepository,
    budgetPeriodRepository,
    dayEntryWriter,
    now,
    createHistoryId,
  } = input;

  function execute(
    command: DayEntryCommand,
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

      yield* validatePeriodDate(
        budgetPeriodRepository,
        command.periodId,
        command.date,
      );

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
    command: HistoryReplayCommand,
    mutateTarget: (history: DailyHistoryRecord) => HistoryMutation,
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      yield* validatePeriodDate(
        budgetPeriodRepository,
        command.periodId,
        command.date,
      );
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
