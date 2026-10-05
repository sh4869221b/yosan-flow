import { Effect } from "effect";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import {
  assertValidDate,
  assertValidInputYen,
  normalizeMemo,
} from "#lib/server/domain/daily-entry.ts";
import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import type { PeriodDayEntryCommand } from "#lib/server/services/day-entry-service.ts";

export type ExecuteEntryInput = {
  operationType: "add" | "overwrite";
  command: PeriodDayEntryCommand;
};

export type PreparedEntryInput = ExecuteEntryInput & {
  period: BudgetPeriodRecord;
  memo: string | null;
  nowIso: string;
};

type HistoryMutationCommandLike = {
  periodId: string;
  date: string;
  historyId: string;
};

type EntryPreparationErrors = {
  createPeriodNotFoundError: (periodId: string) => Error;
  createDateOutOfPeriodError: (date: string, periodId: string) => Error;
};

type EntryPreparationInput = {
  execute: ExecuteEntryInput;
  budgetPeriodRepository: BudgetPeriodRepository;
  now: () => string;
  errors: EntryPreparationErrors;
};

export function validateEntryInputEffect(
  command: Pick<PeriodDayEntryCommand, "date" | "inputYen" | "memo">,
): Effect.Effect<string | null, Error> {
  return Effect.try({
    try: () => {
      assertValidDate(command.date);
      assertValidInputYen(command.inputYen);
      return normalizeMemo(command.memo);
    },
    catch: toEffectError,
  });
}

export function validateHistoryDeleteEffect(
  command: HistoryMutationCommandLike,
): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => assertValidDate(command.date),
    catch: toEffectError,
  });
}

export function validatePeriodDateEffect(input: {
  date: string;
  period: BudgetPeriodRecord;
  createDateOutOfPeriodError: (date: string, periodId: string) => Error;
}): Effect.Effect<void, Error> {
  return Effect.try({
    try: () => {
      if (
        !isDateWithinPeriod(
          input.date,
          input.period.startDate,
          input.period.endDate,
        )
      ) {
        throw input.createDateOutOfPeriodError(input.date, input.period.id);
      }
    },
    catch: toEffectError,
  });
}

export function prepareEntryEffect(
  input: EntryPreparationInput,
): Effect.Effect<PreparedEntryInput, Error> {
  return Effect.gen(function* () {
    const memo = yield* validateEntryInputEffect(input.execute.command);
    const nowIso = input.now();

    const period = yield* input.budgetPeriodRepository.findById(
      input.execute.command.periodId,
    );
    if (!period) {
      return yield* Effect.fail(
        input.errors.createPeriodNotFoundError(input.execute.command.periodId),
      );
    }
    yield* validatePeriodDateEffect({
      date: input.execute.command.date,
      period,
      createDateOutOfPeriodError: input.errors.createDateOutOfPeriodError,
    });

    return {
      ...input.execute,
      period,
      memo,
      nowIso,
    };
  });
}
