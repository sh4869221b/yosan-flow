import type { DailyHistoryRecord } from "#lib/server/db/daily-history-repository.ts";

export function replayDailyHistories(orderedHistories: DailyHistoryRecord[]): {
  histories: DailyHistoryRecord[];
  finalTotalYen: number;
} {
  let currentTotalYen = 0;
  const replayed = orderedHistories.map((history) => {
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
