import { Effect } from "effect";
import type { DatabaseClient } from "$lib/server/db/client";
import type { BudgetPeriodRecord } from "$lib/server/db/budget-period-repository";
import type {
  DailyHistoryRecord,
  DailyHistoryRepository,
} from "$lib/server/db/daily-history-repository";
import type {
  DailyTotalRecord,
  DailyTotalRepository,
} from "$lib/server/db/daily-total-repository";
import type { PreparedEntryInput } from "./commands";
import {
  createDayEntryResult,
  type DayEntryResultShape,
} from "./result-shaping";

type PersistEntryInput = {
  databaseClient: DatabaseClient<
    BudgetPeriodRecord,
    DailyTotalRecord,
    DailyHistoryRecord
  >;
  dailyTotalRepository: DailyTotalRepository;
  dailyHistoryRepository: DailyHistoryRepository;
  createHistoryId: () => string;
  prepared: PreparedEntryInput;
};

export function persistEntryEffect(
  input: PersistEntryInput,
): Effect.Effect<DayEntryResultShape, Error> {
  return input.databaseClient.transaction((tx) =>
    Effect.gen(function* () {
      const existingTotal = yield* input.dailyTotalRepository.findByDate(
        tx,
        input.prepared.command.date,
        input.prepared.period.id,
      );
      const beforeTotalYen = existingTotal?.totalUsedYen ?? 0;
      const afterTotalYen =
        input.prepared.operationType === "add"
          ? beforeTotalYen + input.prepared.command.inputYen
          : input.prepared.command.inputYen;

      const dailyTotal = yield* input.dailyTotalRepository.upsertDailyTotal(
        tx,
        {
          date: input.prepared.command.date,
          yearMonth: input.prepared.command.date.slice(0, 7),
          budgetPeriodId: input.prepared.period.id,
          totalUsedYen: afterTotalYen,
          nowIso: input.prepared.nowIso,
        },
      );
      const history = yield* input.dailyHistoryRepository.insertHistory(tx, {
        id: input.createHistoryId(),
        date: input.prepared.command.date,
        budgetPeriodId: input.prepared.period.id,
        operationType: input.prepared.operationType,
        inputYen: input.prepared.command.inputYen,
        beforeTotalYen,
        afterTotalYen,
        memo: input.prepared.memo,
        createdAt: input.prepared.nowIso,
      });

      return createDayEntryResult({ dailyTotal, history });
    }),
  );
}
