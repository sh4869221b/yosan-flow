import { Effect } from "effect";
import { createInMemoryBudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import { buildPeriodSummary } from "$lib/server/services/month-summary-service";

export type PeriodSummaryForTest = Effect.Effect.Success<
  ReturnType<typeof buildPeriodSummary>
>;

export function createPeriodSummaryRepository(): ReturnType<
  typeof createInMemoryBudgetPeriodRepository
> {
  return createInMemoryBudgetPeriodRepository();
}

export function runPeriodSummary(
  ...input: Parameters<typeof buildPeriodSummary>
): Promise<PeriodSummaryForTest> {
  return Effect.runPromise(buildPeriodSummary(...input));
}

export function createPeriod(
  repository: ReturnType<typeof createInMemoryBudgetPeriodRepository>,
  input: Parameters<
    ReturnType<typeof createInMemoryBudgetPeriodRepository>["createPeriod"]
  >[0],
): Promise<void> {
  return Effect.runPromise(repository.createPeriod(input)).then(() => {});
}
