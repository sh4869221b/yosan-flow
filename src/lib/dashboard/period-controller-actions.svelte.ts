import { Effect } from "effect";
import { runClientEffect } from "$lib/dashboard/client-effect";
import type { PeriodSummary } from "$lib/dashboard/controller-types";
import {
  createPeriodCreationEffect,
  createPeriodRecoveryEffect,
  type PeriodCreationDependencies,
} from "$lib/dashboard/period-controller-create-effect";
import type { PendingPeriodUpdateConfirmation } from "$lib/dashboard/period-update-confirmation-state.svelte";
import type { SavePeriodPayload } from "$lib/dashboard/types";
import type {
  PeriodSetting,
  PeriodSettingsState,
} from "$lib/dashboard/period-settings-state.svelte";

type PeriodControllerActionDependencies = {
  readonly creation: PeriodCreationDependencies;
  readonly settings: PeriodSettingsState;
  readonly getInteractionDisabled: () => boolean;
  readonly getSummaryLoading: () => boolean;
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
  readonly updateCreatePeriodRange: (_range: {
    endDate: string;
    startDate: string;
  }) => void;
};

export function createPeriodControllerActions(
  dependencies: PeriodControllerActionDependencies,
) {
  function saveBudget(): void {
    if (
      dependencies.getInteractionDisabled() ||
      dependencies.getSummaryLoading()
    )
      return;
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
    if (
      dependencies.getInteractionDisabled() ||
      dependencies.getSummaryLoading()
    )
      return;
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
      if (
        dependencies.getInteractionDisabled() ||
        dependencies.getSummaryLoading() ||
        dependencies.getSummary() == null
      )
        return;
      dependencies.settings.budget.draft = String(payload.budgetYen);
      saveBudget();
    },
    handleRangeChange(payload: { endDate: string; startDate: string }): void {
      if (
        dependencies.getInteractionDisabled() ||
        dependencies.getSummaryLoading() ||
        dependencies.getSummary() == null
      )
        return;
      dependencies.settings.range.edit(payload);
      saveRange();
    },
    handleSelectPeriod(payload: { periodId: string }): void {
      dependencies.clearPeriodConfirmation();
      dependencies.creation.createState.setError(null);
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
      if (
        dependencies.getInteractionDisabled() ||
        dependencies.creation.createState.createdRefreshPending
      )
        return;
      dependencies.creation.createState.setSaving(true);
      runClientEffect(createPeriodCreationEffect(dependencies.creation));
    },
    refreshCreatedPeriod(): void {
      if (
        dependencies.getInteractionDisabled() ||
        !dependencies.creation.createState.createdRefreshPending ||
        dependencies.creation.createState.createdPeriodId == null
      )
        return;
      dependencies.creation.createState.setCreatedRefreshing(true);
      runClientEffect(createPeriodRecoveryEffect(dependencies.creation));
    },
    updateCreatePeriodRange(payload: {
      endDate: string;
      startDate: string;
    }): void {
      dependencies.updateCreatePeriodRange(payload);
    },
  };
}
