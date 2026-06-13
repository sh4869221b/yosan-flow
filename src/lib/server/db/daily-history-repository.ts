export { createD1DailyHistoryRepository } from "$lib/server/db/daily-history-d1-repository";
export { createDailyHistoryRepository } from "$lib/server/db/daily-history-in-memory-repository";
export type {
  D1DailyHistoryRepository,
  DailyHistoryRecord,
  DailyHistoryRepository,
  DailyHistoryTransaction,
  InsertDailyHistoryInput,
} from "$lib/server/db/daily-history-types";
