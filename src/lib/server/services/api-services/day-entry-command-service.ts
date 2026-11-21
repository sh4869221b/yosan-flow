import { Effect } from "effect";
import {
  DailyEntryPeriodRangeError,
  type D1DayEntryWriter,
} from "#lib/server/db/day-entry-writer.ts";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import {
  DateOutOfPeriodError,
  HistoryNotFoundError,
  PeriodNotFoundError,
} from "#lib/server/services/day-entry-service.ts";
import type { DayEntryServicePort } from "./types";
import {
  dayEntryFingerprint,
  type DayEntryCommand,
} from "#lib/server/services/day-entry/receipt.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

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
  const { budgetPeriodRepository, dayEntryWriter, now, createHistoryId } =
    input;

  function execute(
    command: DayEntryCommand,
    operationType: "add" | "overwrite",
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      const validate = validatePeriodDate(
        budgetPeriodRepository,
        command.periodId,
        command.date,
      );
      const key = command.idempotencyKey;
      if (key === undefined) yield* validate;
      const receipt =
        key === undefined
          ? undefined
          : {
              key,
              fingerprint: yield* Effect.tryPromise({
                try: () => dayEntryFingerprint(command, operationType),
                catch: toEffectError,
              }),
            };

      const nowIso = now().toISOString();
      const memo = command.memo ?? null;
      yield* dayEntryWriter
        .writeDailyEntry({
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
          receipt,
        })
        .pipe(
          Effect.catchIf(
            (error) => error instanceof DailyEntryPeriodRangeError,
            () =>
              Effect.andThen(
                validate,
                Effect.fail(
                  new DateOutOfPeriodError(command.date, command.periodId),
                ),
              ),
          ),
        );
      return {};
    });
  }

  function replayHistoryMutation(
    command: HistoryReplayCommand,
    mutation: HistoryMutation,
  ): Effect.Effect<Record<string, never>, Error> {
    return Effect.gen(function* () {
      yield* validatePeriodDate(
        budgetPeriodRepository,
        command.periodId,
        command.date,
      );
      const changed = yield* dayEntryWriter.writeHistoryReplay({
        ...mutation,
        budgetPeriodId: command.periodId,
        date: command.date,
        yearMonth: command.date.slice(0, 7),
        nowIso: now().toISOString(),
        historyId: command.historyId,
      });
      if (!changed)
        return yield* Effect.fail(new HistoryNotFoundError(command.historyId));
      return {};
    });
  }

  return {
    addDailyAmount: (command) => execute(command, "add"),
    overwriteDailyAmount: (command) => execute(command, "overwrite"),
    updateHistoryEntry: (command) =>
      Effect.gen(function* () {
        const memo = command.memo ?? null;
        return yield* replayHistoryMutation(command, {
          kind: "update",
          inputYen: command.inputYen,
          memo,
        });
      }),
    deleteHistoryEntry: (command) =>
      replayHistoryMutation(command, { kind: "delete" }),
  };
}
