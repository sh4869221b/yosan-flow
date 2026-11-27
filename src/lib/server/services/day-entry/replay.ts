import type { DailyHistoryRecord } from "#lib/server/db/daily-history-repository.ts";
import { requireSafeYen } from "#lib/server/domain/yen.ts";

export function replayDailyHistories(orderedHistories: DailyHistoryRecord[]): {
  histories: DailyHistoryRecord[];
  finalTotalYen: number;
} {
  let currentTotalYen = 0;
  const replayed = orderedHistories.map((history) => {
    const beforeTotalYen = currentTotalYen;
    const inputYen = requireSafeYen(history.inputYen);
    const afterTotalYen = requireSafeYen(
      history.operationType === "add" ? beforeTotalYen + inputYen : inputYen,
    );
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
