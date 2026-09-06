import type { Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/client-effect";
import { toPeriodId } from "$lib/dashboard/date";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { PendingPeriodUpdateConfirmation } from "$lib/dashboard/period-update-confirmation-state.svelte";
import type { SavePeriodPayload } from "$lib/dashboard/types";
import type {
  PeriodSetting,
  PeriodSettingsState,
} from "$lib/dashboard/period-settings-state.svelte";

type PeriodControllerActionDependencies = {
  readonly createInitialPeriodEffect: () => Effect.Effect<void, never>;
  readonly settings: PeriodSettingsState;
  readonly getSummary: () => PeriodSummary | null;
  readonly beginPeriodConfirmation: () => PendingPeriodUpdateConfirmation | null;
  readonly clearPeriodConfirmation: () => void;
  readonly confirmPeriodUpdateEffect: (
    _pending: PendingPeriodUpdateConfirmation,
  ) => Effect.Effect<void, never>;
  readonly getConfirmSaving: () => boolean;
  readonly refreshSummaryEffect: (
    _periodId: string,
  ) => Effect.Effect<void, never>;
  readonly savePeriodUpdateEffect: (
    _payload: SavePeriodPayload,
    _operation: PeriodSetting,
  ) => Effect.Effect<void, never>;
  readonly setCreateEndDate: (_value: string) => void;
  readonly setCreatePeriodId: (_value: string) => void;
  readonly setCreateStartDate: (_value: string) => void;
};

export function createPeriodControllerActions(
  dependencies: PeriodControllerActionDependencies,
) {
  function saveBudget(): void {
    const summary = dependencies.getSummary();
    const budgetYen = dependencies.settings.validateBudget();
    if (summary == null || budgetYen == null) return;
    runClientEffect(
      dependencies.savePeriodUpdateEffect(
        {
          budgetYen,
          startDate: summary.startDate,
          endDate: summary.endDate,
        },
        "budget",
      ),
    );
  }
  function saveRange(): void {
    const summary = dependencies.getSummary();
    const range = dependencies.settings.validateRange();
    if (summary == null || range == null) return;
    runClientEffect(
      dependencies.savePeriodUpdateEffect(
        {
          budgetYen: summary.budgetYen,
          ...range,
        },
        "range",
      ),
    );
  }
  return {
    saveBudget,
    saveRange,
    handleSavePeriod(payload: { budgetYen: number }): void {
      if (dependencies.getSummary() == null) return;
      dependencies.settings.budget.draft = String(payload.budgetYen);
      saveBudget();
    },
    handleRangeChange(payload: { endDate: string; startDate: string }): void {
      if (dependencies.getSummary() == null) return;
      dependencies.settings.range.edit(payload);
      saveRange();
    },
    handleSelectPeriod(payload: { periodId: string }): void {
      dependencies.clearPeriodConfirmation();
      runClientEffect(dependencies.refreshSummaryEffect(payload.periodId));
    },
    confirmPeriodUpdate(): void {
      const pending = dependencies.beginPeriodConfirmation();
      if (pending != null) {
        runClientEffect(dependencies.confirmPeriodUpdateEffect(pending));
      }
    },
    cancelPeriodUpdateConfirmation(): void {
      if (dependencies.getConfirmSaving()) return;
      dependencies.clearPeriodConfirmation();
      dependencies.settings.range.reset();
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
