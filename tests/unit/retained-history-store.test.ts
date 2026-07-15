import { expect, it } from "vitest";
import { createRetainedHistoryStore } from "$lib/dashboard/retained-history-store";
import type { HistoryItem } from "$lib/dashboard/types";
import { createSummary } from "./day-entry-controller-test-fixtures";

function createHistory(id: string, date: string): HistoryItem {
  return {
    id,
    date,
    operationType: "add",
    inputYen: 500,
    beforeTotalYen: 0,
    afterTotalYen: 500,
    memo: id,
    createdAt: "2026-07-12T00:00:00.000Z",
  };
}

it("evicts the oldest retained histories when more than 32 dates are retained", () => {
  const store = createRetainedHistoryStore();
  const summary = createSummary(0);
  const histories = Array.from({ length: 64 }, (_, index) =>
    createHistory(`history-${index}`, `date-${index}`),
  );
  for (const history of histories) {
    store.retain(
      summary.periodId,
      history.date,
      { histories: [history], summary },
      0,
      1,
    );
  }

  const oldest = histories[0];
  const newest = histories[histories.length - 1];
  expect(oldest).toBeDefined();
  expect(newest).toBeDefined();
  expect(
    store.replay(summary.periodId, oldest?.date ?? "", 0, 1, summary).histories,
  ).toBeNull();
  expect(
    store.replay(summary.periodId, newest?.date ?? "", 0, 1, summary).histories,
  ).toEqual([newest]);
});
