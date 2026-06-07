import type { Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/api";
import { toPeriodId } from "$lib/dashboard/date";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { SavePeriodPayload } from "$lib/dashboard/types";

type PeriodControllerActionDependencies = {
  readonly createInitialPeriodEffect: () => Effect.Effect<void, never>;
  readonly getRangeEndDate: () => string;
  readonly getRangeStartDate: () => string;
  readonly getSummary: () => PeriodSummary | null;
  readonly refreshSummaryEffect: (
    _periodId: string,
  ) => Effect.Effect<void, never>;
  readonly savePeriodUpdateEffect: (
    _payload: SavePeriodPayload,
  ) => Effect.Effect<void, never>;
  readonly setCreateEndDate: (_value: string) => void;
  readonly setCreatePeriodId: (_value: string) => void;
  readonly setCreateStartDate: (_value: string) => void;
  readonly setRangeEndDate: (_value: string) => void;
  readonly setRangeStartDate: (_value: string) => void;
};

export function createPeriodControllerActions(
  dependencies: PeriodControllerActionDependencies,
) {
  return {
    handleSavePeriod(payload: { budgetYen: number }): void {
      const summary = dependencies.getSummary();
      if (summary == null) {
        return;
      }
      runClientEffect(
        dependencies.savePeriodUpdateEffect({
          budgetYen: payload.budgetYen,
          endDate: dependencies.getRangeEndDate(),
          startDate: dependencies.getRangeStartDate(),
        }),
      );
    },
    handleRangeChange(payload: { endDate: string; startDate: string }): void {
      dependencies.setRangeStartDate(payload.startDate);
      dependencies.setRangeEndDate(payload.endDate);
      const summary = dependencies.getSummary();
      if (summary == null) {
        return;
      }
      runClientEffect(
        dependencies.savePeriodUpdateEffect({
          budgetYen: summary.budgetYen,
          endDate: payload.endDate,
          startDate: payload.startDate,
        }),
      );
    },
    handleSelectPeriod(payload: { periodId: string }): void {
      runClientEffect(dependencies.refreshSummaryEffect(payload.periodId));
    },
    createInitialPeriod(): void {
      runClientEffect(dependencies.createInitialPeriodEffect());
    },
    updateCreatePeriodRange(payload: {
      endDate: string;
      startDate: string;
    }): void {
      dependencies.setCreateStartDate(payload.startDate);
      dependencies.setCreateEndDate(payload.endDate);
      dependencies.setCreatePeriodId(toPeriodId(payload.startDate));
    },
  };
}
