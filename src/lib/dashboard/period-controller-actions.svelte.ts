import { Effect } from "effect";
import { runClientEffect } from "#lib/dashboard/client-effect.ts";
import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
import {
  createPeriodCreationEffect,
  createPeriodRecoveryEffect,
  type PeriodCreationDependencies,
} from "#lib/dashboard/period-controller-create-effect.ts";
import type {
  PendingPeriodUpdateConfirmation,
  PeriodUpdateConfirmationState,
} from "#lib/dashboard/period-update-confirmation-state.svelte.ts";
import type { SavePeriodPayload } from "#lib/dashboard/types.ts";
import type {
  PeriodSetting,
  PeriodSettingsState,
} from "#lib/dashboard/period-settings-state.svelte.ts";

type PeriodControllerActionDependencies = {
  readonly confirmationState: PeriodUpdateConfirmationState;
  readonly refreshConfirmationEffect: () => Effect.Effect<void, never>;
  readonly creation: PeriodCreationDependencies;
  readonly settings: PeriodSettingsState;
  readonly getInteractionDisabled: () => boolean;
  readonly getSummaryLoading: () => boolean;
  readonly getSummary: () => PeriodSummary | null;
  readonly confirmPeriodUpdateEffect: (
    _pending: PendingPeriodUpdateConfirmation,
  ) => Effect.Effect<void, never>;
  readonly refreshSummaryEffect: (
    _periodId: string,
  ) => Effect.Effect<void, never>;
  readonly savePeriodUpdateEffect: (
    _payload: SavePeriodPayload,
    _operation: PeriodSetting,
  ) => Effect.Effect<void, never>;
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
    handleSelectPeriod(payload: { periodId: string }): void {
      dependencies.confirmationState.clear();
      dependencies.creation.createState.setError(null);
      runClientEffect(dependencies.refreshSummaryEffect(payload.periodId));
    },
    refreshPeriodConfirmation(): void {
      if (dependencies.confirmationState.confirmSaving) return;
      runClientEffect(dependencies.refreshConfirmationEffect());
    },
    confirmPeriodUpdate(): void {
      const pending = dependencies.confirmationState.beginConfirmation();
      if (pending == null && dependencies.confirmationState.recoveryRequired) {
        runClientEffect(dependencies.refreshConfirmationEffect());
      }
      if (pending != null) {
        runClientEffect(dependencies.confirmPeriodUpdateEffect(pending));
      }
    },
    cancelPeriodUpdateConfirmation(): void {
      if (dependencies.confirmationState.confirmSaving) return;
      dependencies.confirmationState.clear();
      dependencies.settings.range.reset();
      const periodId = dependencies.getSummary()?.periodId;
      if (periodId)
        dependencies.confirmationState.report({ periodId, kind: "cancelled" });
    },
    resetCreatePeriod(): void {
      if (
        dependencies.getInteractionDisabled() ||
        dependencies.creation.createState.createdRefreshPending
      )
        return;
      dependencies.creation.createState.resetDraft();
    },
    clearCreateError(): void {
      if (
        dependencies.getInteractionDisabled() ||
        dependencies.creation.createState.createdRefreshPending
      )
        return;
      dependencies.creation.createState.setError(null);
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
  };
}
