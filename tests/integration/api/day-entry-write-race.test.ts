import { Effect } from "effect";
import { expect, it } from "vitest";
import { createD1DayEntryWriter } from "#lib/server/db/day-entry-writer.ts";
import type { BudgetPeriodRepository } from "#lib/server/db/budget-period-repository.ts";
import type { D1DailyHistoryRepository } from "#lib/server/db/daily-history-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createD1DayEntryService } from "#lib/server/services/api-services/day-entry-command-service.ts";
import { DateOutOfPeriodError } from "#lib/server/services/day-entry-service.ts";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";

it.each(["addDailyAmount", "overwriteDailyAmount"] as const)(
  "%s reports an out-of-period error if the boundary moves after validation",
  async (method) => {
    const before = {
      id: "p",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      budgetYen: 1000,
      status: "active" as const,
      predecessorPeriodId: null,
      createdAt: "now",
      updatedAt: "now",
    };
    const db = createPeriodAwareD1Fake([], {
      periods: [
        {
          id: "p",
          start_date: "2026-07-16",
          end_date: "2026-07-31",
          budget_yen: 1000,
          status: "active",
          predecessor_period_id: null,
          created_at: "now",
          updated_at: "now",
        },
      ],
    });
    const service = createD1DayEntryService({
      budgetPeriodRepository: {
        findById: () => Effect.succeed(before),
      } as unknown as BudgetPeriodRepository,
      dailyHistoryRepository: {} as D1DailyHistoryRepository,
      dayEntryWriter: createD1DayEntryWriter({ db }),
      now: () => new Date("2026-07-01T00:00:00.000Z"),
      createHistoryId: () => "h",
    });
    await expect(
      runApiEffect(
        service[method]({ periodId: "p", date: "2026-07-15", inputYen: 50 }),
      ),
    ).rejects.toBeInstanceOf(DateOutOfPeriodError);
  },
);
