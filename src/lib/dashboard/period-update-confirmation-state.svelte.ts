import type {
  PeriodBoundaryUpdateProposal,
  PeriodUpdateConfirmationRequest,
} from "#lib/dashboard/period-update-api.ts";
import type { PeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";

export type PeriodUpdateConfirmationOwnership = {
  readonly editedPeriodId: string;
  readonly previousId: string;
  readonly nextId: string;
  readonly requestSequence: number;
  readonly selectedPeriodId: string;
  readonly previousRevision: number;
  readonly nextRevision: number;
};

export type PendingPeriodUpdateConfirmation = {
  readonly proposal: PeriodBoundaryUpdateProposal;
  readonly request: PeriodUpdateConfirmationRequest;
  readonly ownership: PeriodUpdateConfirmationOwnership;
};

export type ConfirmationResult = {
  readonly periodId: string;
  readonly kind: "cancelled" | "saved" | "reedit" | "error";
  readonly message?: string;
};

type ConfirmationRecovery = {
  readonly periodId: string;
  readonly saved: boolean;
};

type Dependencies = {
  readonly getSelectedPeriodId: () => string | null;
  readonly summaryRevision: PeriodSummaryRevision;
};

export function createPeriodUpdateConfirmationState(
  dependencies: Dependencies,
) {
  let pending = $state<PendingPeriodUpdateConfirmation | null>(null);
  let confirmSaving = $state(false);
  let refreshing = $state(false);
  let recovery = $state<ConfirmationRecovery | null>(null);
  let result = $state<ConfirmationResult | null>(null);

  function isOwned(candidate: PendingPeriodUpdateConfirmation): boolean {
    const { ownership } = candidate;
    return (
      pending?.ownership.requestSequence === ownership.requestSequence &&
      dependencies.getSelectedPeriodId() === ownership.selectedPeriodId &&
      ownership.selectedPeriodId === ownership.editedPeriodId &&
      dependencies.summaryRevision.get(ownership.previousId) ===
        ownership.previousRevision &&
      dependencies.summaryRevision.get(ownership.nextId) ===
        ownership.nextRevision
    );
  }

  function getPending(): PendingPeriodUpdateConfirmation | null {
    if (pending != null && !isOwned(pending)) {
      if (
        dependencies.getSelectedPeriodId() === pending.ownership.editedPeriodId
      ) {
        recovery = { periodId: pending.ownership.editedPeriodId, saved: false };
        result = null;
      }
      pending = null;
    }
    return pending;
  }

  return {
    get result() {
      return result;
    },
    get recovery() {
      return recovery;
    },
    get refreshing() {
      return refreshing;
    },
    get recoveryRequired() {
      getPending();
      return recovery != null && result == null && !refreshing;
    },
    dismissResult(): void {
      result = null;
    },
    report(next: ConfirmationResult): void {
      result = next;
    },
    recover(periodId: string, saved: boolean): void {
      pending = null;
      recovery = { periodId, saved };
      result = null;
    },
    beginRecovery(): ConfirmationRecovery | null {
      if (refreshing || recovery == null) return null;
      refreshing = true;
      result = null;
      return recovery;
    },
    finishRecovery(candidate: ConfirmationRecovery): boolean {
      if (recovery !== candidate) return false;
      refreshing = false;
      return dependencies.getSelectedPeriodId() === candidate.periodId;
    },
    completeRecovery(): void {
      recovery = null;
    },
    get pending() {
      return getPending();
    },
    get confirmSaving() {
      return confirmSaving;
    },
    open(nextPending: PendingPeriodUpdateConfirmation): boolean {
      if (
        nextPending.proposal.editedPeriodId !==
          nextPending.ownership.editedPeriodId ||
        nextPending.proposal.previous.before.id !==
          nextPending.ownership.previousId ||
        nextPending.proposal.next.before.id !== nextPending.ownership.nextId
      ) {
        return false;
      }
      recovery = null;
      result = null;
      pending = nextPending;
      if (!isOwned(nextPending)) {
        pending = null;
        return false;
      }
      return true;
    },
    clear(): void {
      pending = null;
      recovery = null;
      result = null;
      refreshing = false;
    },
    clearOwned(candidate: PendingPeriodUpdateConfirmation): void {
      if (
        pending?.ownership.requestSequence ===
        candidate.ownership.requestSequence
      ) {
        pending = null;
      }
    },
    dropIfStale(): void {
      getPending();
    },
    beginConfirmation(): PendingPeriodUpdateConfirmation | null {
      const owned = getPending();
      if (owned == null || confirmSaving) return null;
      confirmSaving = true;
      return owned;
    },
    owns: isOwned,
    finishConfirmation(): void {
      confirmSaving = false;
    },
  };
}

export type PeriodUpdateConfirmationState = ReturnType<
  typeof createPeriodUpdateConfirmationState
>;
