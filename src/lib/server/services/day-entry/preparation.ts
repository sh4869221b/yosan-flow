import { Effect } from "effect";
import type {
  BudgetPeriodRecord,
  BudgetPeriodRepository,
} from "#lib/server/db/budget-period-repository.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import { isDateWithinPeriod } from "#lib/server/domain/budget-period.ts";
import type { PeriodDayEntryCommand } from "#lib/server/services/day-entry-service.ts";
import { DateOutOfPeriodError, PeriodNotFoundError } from "./errors";

export type ExecuteEntryInput = {
  operationType: "add" | "overwrite";
  command: PeriodDayEntryCommand;
};

export type PreparedEntryInput = ExecuteEntryInput & {
  period: BudgetPeriodRecord;
  memo: string | null;
  nowIso: string;
};

type EntryPreparationInput = {
  execute: ExecuteEntryInput;
  budgetPeriodRepository: BudgetPeriodRepository;
  now: () => string;
};

export function validatePeriodDateEffect(input: {
  date: string;
  period: BudgetPeriodRecord;
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
        throw new DateOutOfPeriodError(input.date, input.period.id);
      }
    },
    catch: toEffectError,
  });
}

export function prepareEntryEffect(
  input: EntryPreparationInput,
): Effect.Effect<PreparedEntryInput, Error> {
  return Effect.gen(function* () {
    const memo = input.execute.command.memo ?? null;
    const nowIso = input.now();

    const period = yield* input.budgetPeriodRepository.findById(
      input.execute.command.periodId,
    );
    if (!period) {
      return yield* Effect.fail(
        new PeriodNotFoundError(input.execute.command.periodId),
      );
    }
    yield* validatePeriodDateEffect({
      date: input.execute.command.date,
      period,
    });

    return {
      ...input.execute,
      period,
      memo,
      nowIso,
    };
  });
}
