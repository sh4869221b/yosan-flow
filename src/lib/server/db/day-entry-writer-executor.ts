import type { D1Database } from "#lib/server/db/d1-types.ts";
import { buildHistoryReplayStatements } from "#lib/server/db/day-entry-replay-sql.ts";
import { buildDailyEntryStatements } from "#lib/server/db/day-entry-write-sql.ts";
import type {
  D1DayEntryReplayCommand,
  D1DayEntryWriter,
} from "#lib/server/db/day-entry-writer-types.ts";

export async function executeDailyEntryWrite(
  db: D1Database,
  input: Parameters<D1DayEntryWriter["writeDailyEntry"]>[0],
): Promise<void> {
  await db.batch(buildDailyEntryStatements(db, input));
}

export async function executeHistoryReplayWrite(
  db: D1Database,
  command: D1DayEntryReplayCommand,
): Promise<void> {
  await db.batch(buildHistoryReplayStatements(db, command));
}
