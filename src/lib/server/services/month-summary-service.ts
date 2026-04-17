import type { MonthRecord, MonthRepository } from "$lib/server/db/month-repository";

export type MonthStatus = "initialized" | "uninitialized";

export type MonthSummary = {
  yearMonth: string;
  monthStatus: MonthStatus;
  budgetYen: number | null;
  budgetStatus: "unset" | "set";
  initializedFromPreviousMonth: boolean;
  carriedFromYearMonth: string | null;
  suggestedInitialBudgetYen: number | null;
};

export type InitializeMonthInput = {
  yearMonth: string;
  budgetYen?: number;
  nowIso: string;
};

export type UpsertMonthBudgetInput = {
  yearMonth: string;
  budgetYen: number;
  nowIso: string;
};

export async function buildMonthSummary(
  monthRepository: MonthRepository,
  yearMonth: string
): Promise<MonthSummary> {
  const month = await monthRepository.findMonth(yearMonth);
  if (month) {
    return {
      yearMonth: month.yearMonth,
      monthStatus: "initialized",
      budgetYen: month.budgetYen,
      budgetStatus: month.budgetStatus,
      initializedFromPreviousMonth: month.initializedFromPreviousMonth,
      carriedFromYearMonth: month.carriedFromYearMonth,
      suggestedInitialBudgetYen: null
    };
  }

  const previousBudget = await monthRepository.findPreviousMonthWithBudget(yearMonth);
  return {
    yearMonth,
    monthStatus: "uninitialized",
    budgetYen: null,
    budgetStatus: "unset",
    initializedFromPreviousMonth: false,
    carriedFromYearMonth: null,
    suggestedInitialBudgetYen: previousBudget?.budgetYen ?? null
  };
}

export async function initializeMonthExplicit(
  monthRepository: MonthRepository,
  input: InitializeMonthInput
): Promise<MonthRecord> {
  const existing = await monthRepository.findMonth(input.yearMonth);
  if (existing) {
    return existing;
  }

  const previousBudget = await monthRepository.findPreviousMonthWithBudget(input.yearMonth);
  const initializedFromPreviousMonth = previousBudget != null;
  const resolvedBudgetYen = input.budgetYen ?? previousBudget?.budgetYen ?? null;

  return monthRepository.createMonthIfAbsent({
    yearMonth: input.yearMonth,
    budgetYen: resolvedBudgetYen,
    budgetStatus: resolvedBudgetYen == null ? "unset" : "set",
    initializedFromPreviousMonth,
    carriedFromYearMonth: previousBudget?.yearMonth ?? null,
    nowIso: input.nowIso
  });
}

export async function upsertMonthBudget(
  monthRepository: MonthRepository,
  input: UpsertMonthBudgetInput
): Promise<MonthRecord> {
  const existing = await monthRepository.findMonth(input.yearMonth);
  if (!existing) {
    return initializeMonthExplicit(monthRepository, {
      yearMonth: input.yearMonth,
      budgetYen: input.budgetYen,
      nowIso: input.nowIso
    });
  }

  if (existing.budgetStatus === "set" && existing.budgetYen === input.budgetYen) {
    return existing;
  }

  return monthRepository.updateBudget(input.yearMonth, input.budgetYen, input.nowIso);
}
