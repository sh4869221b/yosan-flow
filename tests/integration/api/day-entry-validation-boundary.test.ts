import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import * as dailyEntry from "#lib/server/domain/daily-entry.ts";
import type { BudgetPeriodRepository } from "#lib/server/db/budget-period-repository.ts";
import type { D1DailyHistoryRepository } from "#lib/server/db/daily-history-repository.ts";
import type { D1DayEntryWriter } from "#lib/server/db/day-entry-writer.ts";
import { createD1DayEntryService } from "#lib/server/services/api-services/day-entry-command-service.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import {
  DEFAULT_DATE,
  DEFAULT_PERIOD_ID,
  createDayEntryFixture,
  seedPeriod,
} from "./day-entry-fixture";
import { createFixture } from "./periods-fixture";

describe("day entry validation boundary", () => {
  it("does not revalidate trusted commands during add, overwrite, or history replay", async () => {
    const fixture = createDayEntryFixture();
    await seedPeriod(fixture);
    const date = vi.spyOn(dailyEntry, "assertValidDate");
    const amount = vi.spyOn(dailyEntry, "assertValidInputYen");
    const memo = vi.spyOn(dailyEntry, "normalizeMemo");
    try {
      const command = {
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 100,
        memo: "lunch",
      };
      await Effect.runPromise(fixture.service.addDailyAmount(command));
      await Effect.runPromise(fixture.service.overwriteDailyAmount(command));
      await Effect.runPromise(
        fixture.service.updateHistoryEntry({
          ...command,
          historyId: "history-id-1",
        }),
      );
      await Effect.runPromise(
        fixture.service.deleteHistoryEntry({
          ...command,
          historyId: "history-id-2",
        }),
      );
      expect(date).not.toHaveBeenCalled();
      expect(amount).not.toHaveBeenCalled();
      expect(memo).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not revalidate trusted D1 commands", async () => {
    const date = vi.spyOn(dailyEntry, "assertValidDate");
    const amount = vi.spyOn(dailyEntry, "assertValidInputYen");
    const memo = vi.spyOn(dailyEntry, "normalizeMemo");
    try {
      const service = createD1DayEntryService({
        budgetPeriodRepository: {
          findById: () =>
            Effect.succeed({
              id: DEFAULT_PERIOD_ID,
              startDate: DEFAULT_DATE,
              endDate: "2026-05-19",
            }),
        } as unknown as BudgetPeriodRepository,
        dailyHistoryRepository: {
          hasHistoryById: () => Effect.succeed(true),
        } as unknown as D1DailyHistoryRepository,
        dayEntryWriter: {
          writeDailyEntry: () => Effect.void,
          writeHistoryReplay: () => Effect.void,
        } as unknown as D1DayEntryWriter,
        now: () => new Date("2026-04-20T00:00:00.000Z"),
        createHistoryId: () => "history",
      });
      const command = {
        periodId: DEFAULT_PERIOD_ID,
        date: DEFAULT_DATE,
        inputYen: 100,
        memo: "lunch",
      };
      await Effect.runPromise(service.addDailyAmount(command));
      await Effect.runPromise(service.overwriteDailyAmount(command));
      await Effect.runPromise(
        service.updateHistoryEntry({ ...command, historyId: "history" }),
      );
      await Effect.runPromise(
        service.deleteHistoryEntry({ ...command, historyId: "history" }),
      );
      expect(date).not.toHaveBeenCalled();
      expect(amount).not.toHaveBeenCalled();
      expect(memo).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("validates and normalizes raw request data before saving", async () => {
    const fixture = createFixture(undefined, () => "history-boundary");
    await runApiEffect(
      fixture.services.createPeriod({
        id: DEFAULT_PERIOD_ID,
        startDate: DEFAULT_DATE,
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );
    const params = { periodId: DEFAULT_PERIOD_ID, date: DEFAULT_DATE };
    const request = (body: unknown) =>
      new Request("http://localhost/day/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const invalidAmount = await fixture.addDay({
      params,
      request: request({ inputYen: -1 }),
    } as any);
    expect(invalidAmount.status).toBe(400);
    const invalidMemo = await fixture.addDay({
      params,
      request: request({ inputYen: 1, memo: 12 }),
    } as any);
    expect(invalidMemo.status).toBe(400);
    const saved = await fixture.addDay({
      params,
      request: request({ inputYen: 1, memo: "  lunch  " }),
    } as any);
    expect(saved.status).toBe(200);
    const histories = await runApiEffect(
      fixture.services.listHistoryByDate(DEFAULT_PERIOD_ID, DEFAULT_DATE),
    );
    expect(histories).toHaveLength(1);
    expect(histories[0].memo).toBe("lunch");
  });
});
