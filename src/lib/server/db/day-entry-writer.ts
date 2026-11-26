import { Effect } from "effect";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { buildHistoryReplayStatements } from "#lib/server/db/day-entry-replay-sql.ts";
import { buildDailyEntryStatements } from "#lib/server/db/day-entry-write-sql.ts";
import type {
  D1DayEntryCommand,
  D1DayEntryWriter,
} from "#lib/server/db/day-entry-writer-types.ts";
import { DayEntryReceiptConflictError } from "#lib/server/services/day-entry/errors.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";
import {
  requireSafeYen,
  YenTotalOutOfRangeError,
} from "#lib/server/domain/yen.ts";

type CreateD1DayEntryWriterInput = {
  db: D1Database;
};

export type { D1DayEntryWriter } from "#lib/server/db/day-entry-writer-types.ts";

export class DailyEntryPeriodRangeError extends Error {
  constructor() {
    super("Daily entry period no longer contains the date");
    this.name = "DailyEntryPeriodRangeError";
  }
}

function toDayEntryWriteError(error: unknown): Error {
  const failure = toEffectError(error);
  // The first statement of either batch deliberately trips this specific
  // constraint before any subsequent write when the projected yen is invalid.
  const constraint =
    "NOT NULL constraint failed: daily_operation_histories_v2.before_total_yen";
  if (
    failure.message ===
      `D1_ERROR: ${constraint}: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)` ||
    failure.message === `D1_ERROR: ${constraint}: SQLITE_CONSTRAINT` ||
    (failure.message === constraint &&
      "errcode" in failure &&
      failure.errcode === 1299)
  ) {
    return new YenTotalOutOfRangeError(
      "Day-entry write exceeds the safe yen range",
      { cause: failure },
    );
  }
  return failure;
}

function validateDailyEntryCommand({
  total,
  history,
  mode,
}: D1DayEntryCommand): void {
  if (
    total.budgetPeriodId !== history.budgetPeriodId ||
    total.date !== history.date
  ) {
    throw new Error("Daily entry total and history ownership differ");
  }
  if (
    total.totalUsedYen !== history.inputYen ||
    mode !== history.operationType
  ) {
    throw new Error("Daily entry total and history inputs differ");
  }
  requireSafeYen(history.inputYen);
}

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  return {
    writeDailyEntry(command) {
      return Effect.tryPromise({
        try: async () => {
          validateDailyEntryCommand(command);
          const results = await input.db.batch<{ fingerprint?: string }>(
            buildDailyEntryStatements(input.db, command),
          );
          const fingerprint = results[3]?.results[0]?.fingerprint;
          if (command.receipt) {
            if (fingerprint === undefined)
              throw new DailyEntryPeriodRangeError();
            if (fingerprint !== command.receipt.fingerprint) {
              throw new DayEntryReceiptConflictError();
            }
          } else if (results[0]?.meta.changes !== 1) {
            throw new DailyEntryPeriodRangeError();
          }
        },
        catch: toDayEntryWriteError,
      });
    },

    writeHistoryReplay(command) {
      return Effect.tryPromise({
        try: async () => {
          if (command.kind === "update") requireSafeYen(command.inputYen);
          const results = await input.db.batch(
            buildHistoryReplayStatements(input.db, command),
          );
          return results[3]?.meta.changes === 1;
        },
        catch: toDayEntryWriteError,
      });
    },
  };
}
