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

export function createD1DayEntryWriter(
  input: CreateD1DayEntryWriterInput,
): D1DayEntryWriter {
  return {
    writeDailyEntry(command) {
      return Effect.tryPromise({
        try: async () => {
          await input.db.batch(buildDailyEntryStatements(input.db, command));
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
