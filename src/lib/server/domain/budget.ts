export type CalculateRemainingYenInput = {
  budgetYen: number;
  spentToDateYen: number;
  plannedYen: number;
};

export function calculateRemainingYen(
  input: CalculateRemainingYenInput,
): number {
  return input.budgetYen - input.spentToDateYen - input.plannedYen;
}

export function calculateOverspentYen(remainingYen: number): number {
  return remainingYen < 0 ? Math.abs(remainingYen) : 0;
}
