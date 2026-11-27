export const MAX_SAFE_YEN = Number.MAX_SAFE_INTEGER;

export class YenTotalOutOfRangeError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read by the API error boundary.
  readonly code = "YEN_TOTAL_OUT_OF_RANGE";
}

export function requireSafeYen(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new YenTotalOutOfRangeError(
      "Yen total is outside the safe integer range",
    );
  }
  return value;
}

export function requirePeriodYenFits(
  totals: Iterable<{
    budgetPeriodId: string;
    date: string;
    totalUsedYen: number;
  }>,
  periodId: string,
  date: string,
  nextDailyTotal: number,
): void {
  let periodTotal = requireSafeYen(nextDailyTotal);
  for (const row of totals) {
    if (row.budgetPeriodId === periodId && row.date !== date) {
      periodTotal = requireSafeYen(
        periodTotal + requireSafeYen(row.totalUsedYen),
      );
    }
  }
}
