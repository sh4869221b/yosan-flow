import { describe, expect, it } from "vitest";
import { createInMemoryMonthRepository } from "$lib/server/db/month-repository";
import {
  buildMonthSummary,
  initializeMonthExplicit,
  upsertMonthBudget
} from "$lib/server/services/month-summary-service";

describe("month explicit initialization", () => {
  it("GET 相当の summary は月レコードを自動作成しない", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 120000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    const result = await buildMonthSummary(repository, "2026-04");

    expect(result.monthStatus).toBe("uninitialized");
    expect(result.suggestedInitialBudgetYen).toBe(120000);
    expect(await repository.findMonth("2026-04")).toBeNull();
  });

  it("initialize で前月 budget を carry し、重複初期化は冪等", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 120000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    const first = await initializeMonthExplicit(repository, {
      yearMonth: "2026-04",
      budgetYen: 120000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });
    const second = await initializeMonthExplicit(repository, {
      yearMonth: "2026-04",
      budgetYen: 999999,
      nowIso: "2026-04-02T00:00:00.000Z"
    });

    expect(first.initializedFromPreviousMonth).toBe(true);
    expect(first.carriedFromYearMonth).toBe("2026-03");
    expect(second.budgetYen).toBe(120000);
    expect(await repository.countMonths()).toBe(2);
  });

  it("service + repository を跨いで初期化結果が再読込できる", async () => {
    const writerRepository = createInMemoryMonthRepository();
    await writerRepository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 70000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    await initializeMonthExplicit(writerRepository, {
      yearMonth: "2026-04",
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    const persistedSnapshot = writerRepository.dumpSnapshot();
    const readerRepository = createInMemoryMonthRepository(persistedSnapshot);
    const month = await readerRepository.findMonth("2026-04");

    expect(month).not.toBeNull();
    expect(month?.budgetYen).toBe(70000);
    expect(month?.carriedFromYearMonth).toBe("2026-03");
  });

  it("PUT /budget 相当の初回更新で月を作成できる", async () => {
    const repository = createInMemoryMonthRepository();
    await repository.createMonthIfAbsent({
      yearMonth: "2026-03",
      budgetYen: 80000,
      budgetStatus: "set",
      initializedFromPreviousMonth: false,
      carriedFromYearMonth: null,
      nowIso: "2026-03-01T00:00:00.000Z"
    });

    const month = await upsertMonthBudget(repository, {
      yearMonth: "2026-04",
      budgetYen: 100000,
      nowIso: "2026-04-01T00:00:00.000Z"
    });

    expect(month.budgetYen).toBe(100000);
    expect(month.budgetStatus).toBe("set");
    expect(month.initializedFromPreviousMonth).toBe(true);
    expect(month.carriedFromYearMonth).toBe("2026-03");
  });

  it("yearMonth は 01..12 の範囲のみ許可する", async () => {
    const repository = createInMemoryMonthRepository();

    await expect(repository.findMonth("2026-00")).rejects.toThrow("Invalid yearMonth");
    await expect(repository.findMonth("2026-13")).rejects.toThrow("Invalid yearMonth");
    await expect(repository.findMonth("2026-12")).resolves.toBeNull();
  });
});
