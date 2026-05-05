import { describe, expect, it } from "vitest";
import {
  getNextPeriodStartDate,
  isDateWithinPeriod,
} from "$lib/server/domain/budget-period";
import { createInMemoryBudgetPeriodRepository } from "$lib/server/db/budget-period-repository";

describe("budget period domain", () => {
  it("treats the next period start as the day after previous end", () => {
    expect(getNextPeriodStartDate("2026-05-19")).toBe("2026-05-20");
  });

  it("returns false for dates outside the period", () => {
    expect(isDateWithinPeriod("2026-04-19", "2026-04-20", "2026-05-19")).toBe(
      false,
    );
  });

  it("returns true for boundary dates inside the period", () => {
    expect(isDateWithinPeriod("2026-04-20", "2026-04-20", "2026-05-19")).toBe(
      true,
    );
    expect(isDateWithinPeriod("2026-05-19", "2026-04-20", "2026-05-19")).toBe(
      true,
    );
  });
});

describe("budget period repository", () => {
  it("rejects invalid period ranges on create", async () => {
    const repository = createInMemoryBudgetPeriodRepository();

    await expect(
      repository.createPeriod({
        id: "period-1",
        startDate: "2026-05-20",
        endDate: "2026-05-19",
        budgetYen: 1000,
        nowIso: "2026-05-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("Invalid period");
  });

  it("rejects predecessor updates that would break successor continuity", async () => {
    const repository = createInMemoryBudgetPeriodRepository();
    await repository.createPeriod({
      id: "period-a",
      startDate: "2026-04-20",
      endDate: "2026-05-19",
      budgetYen: 1000,
      nowIso: "2026-04-01T00:00:00.000Z",
    });
    await repository.createPeriod({
      id: "period-b",
      startDate: "2026-05-20",
      endDate: "2026-06-19",
      budgetYen: 1000,
      predecessorPeriodId: "period-a",
      nowIso: "2026-05-01T00:00:00.000Z",
    });

    await expect(
      repository.updatePeriod({
        id: "period-a",
        startDate: "2026-04-20",
        endDate: "2026-05-18",
        budgetYen: 1000,
        nowIso: "2026-05-02T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_CONTINUITY_VIOLATION" });
  });
});
