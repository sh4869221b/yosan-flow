import { Effect } from "effect";
import type { D1Database } from "#lib/server/db/d1-types.ts";
import { buildHistoryReplayStatements } from "#lib/server/db/day-entry-replay-sql.ts";
import { buildDailyEntryStatements } from "#lib/server/db/day-entry-write-sql.ts";
import type { D1DayEntryWriter } from "#lib/server/db/day-entry-writer-types.ts";
import { toEffectError } from "#lib/server/effect/runtime.ts";

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

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  return {
    writeDailyEntry(command) {
      return Effect.tryPromise({
        try: async () => {
          if (
            command.total.budgetPeriodId !== command.history.budgetPeriodId ||
            command.total.date !== command.history.date
          ) {
            throw new Error("Daily entry total and history ownership differ");
          }
          const results = await input.db.batch(
            buildDailyEntryStatements(input.db, command),
          );
          if (results[0]?.meta.changes !== 1) {
            throw new DailyEntryPeriodRangeError();
          }
        },
        catch: toEffectError,
      });
    },

    writeHistoryReplay(command) {
      return Effect.tryPromise({
        try: async () => {
          await input.db.batch(buildHistoryReplayStatements(input.db, command));
        },
        catch: toEffectError,
      });
    },
  };
}
