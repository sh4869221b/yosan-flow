import { describe, expect, it } from "vitest";
import type { DailyHistoryRecord } from "$lib/server/db/daily-history-repository";
import { replayDailyHistories } from "$lib/server/services/day-entry/replay";

function createHistory(
  input: Partial<DailyHistoryRecord> &
    Pick<DailyHistoryRecord, "id" | "createdAt">,
): DailyHistoryRecord {
  return {
    id: input.id,
    date: input.date ?? "2026-04-20",
    budgetPeriodId: input.budgetPeriodId ?? "p1",
    operationType: input.operationType ?? "add",
    inputYen: input.inputYen ?? 0,
    beforeTotalYen: input.beforeTotalYen ?? 0,
    afterTotalYen: input.afterTotalYen ?? 0,
    memo: input.memo ?? null,
    createdAt: input.createdAt,
  };
}

describe("replayDailyHistories", () => {
  it("replays add histories in chronological order", () => {
    const result = replayDailyHistories([
      createHistory({
        id: "h2",
        createdAt: "2026-04-20T00:00:02.000Z",
        inputYen: 2000,
      }),
      createHistory({
        id: "h1",
        createdAt: "2026-04-20T00:00:01.000Z",
        inputYen: 1000,
      }),
    ]);

    expect(result.finalTotalYen).toBe(3000);
    expect(result.histories).toMatchObject([
      { id: "h1", beforeTotalYen: 0, afterTotalYen: 1000 },
      { id: "h2", beforeTotalYen: 1000, afterTotalYen: 3000 },
    ]);
  });

  it("resets chain total on overwrite and continues replay after it", () => {
    const result = replayDailyHistories([
      createHistory({
        id: "h1",
        createdAt: "2026-04-20T00:00:01.000Z",
        operationType: "add",
        inputYen: 1000,
      }),
      createHistory({
        id: "h2",
        createdAt: "2026-04-20T00:00:02.000Z",
        operationType: "overwrite",
        inputYen: 500,
      }),
      createHistory({
        id: "h3",
        createdAt: "2026-04-20T00:00:03.000Z",
        operationType: "add",
        inputYen: 700,
      }),
    ]);

    expect(result.finalTotalYen).toBe(1200);
    expect(result.histories).toMatchObject([
      { id: "h1", beforeTotalYen: 0, afterTotalYen: 1000 },
      { id: "h2", beforeTotalYen: 1000, afterTotalYen: 500 },
      { id: "h3", beforeTotalYen: 500, afterTotalYen: 1200 },
    ]);
  });
});
