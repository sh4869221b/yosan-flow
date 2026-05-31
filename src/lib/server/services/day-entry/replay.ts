import type { DailyHistoryRecord } from "$lib/server/db/daily-history-repository";

function compareHistoryChronological(
  left: DailyHistoryRecord,
  right: DailyHistoryRecord,
): number {
  if (left.createdAt === right.createdAt) {
    return 0;
  }
  return left.createdAt.localeCompare(right.createdAt);
}

export function replayDailyHistories(histories: DailyHistoryRecord[]): {
  histories: DailyHistoryRecord[];
  finalTotalYen: number;
} {
  let currentTotalYen = 0;
  const replayed = [...histories]
    .sort(compareHistoryChronological)
    .map((history) => {
      const beforeTotalYen = currentTotalYen;
      const afterTotalYen =
        history.operationType === "add"
          ? beforeTotalYen + history.inputYen
          : history.inputYen;
      currentTotalYen = afterTotalYen;
      return {
        ...history,
        beforeTotalYen,
        afterTotalYen,
      };
    });

  return {
    histories: replayed,
    finalTotalYen: currentTotalYen,
  };
}
