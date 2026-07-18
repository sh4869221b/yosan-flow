import type {
  PeriodBoundaryUpdateProposal,
  PeriodUpdateConfirmationRequest,
} from "$lib/dashboard/period-update-api";
import type { PeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

export type PeriodUpdateConfirmationOwnership = {
  readonly targetId: string;
  readonly successorId: string;
  readonly requestSequence: number;
  readonly selectedPeriodId: string;
  readonly targetRevision: number;
  readonly successorRevision: number;
};

export type PendingPeriodUpdateConfirmation = {
  readonly proposal: PeriodBoundaryUpdateProposal;
  readonly request: PeriodUpdateConfirmationRequest;
  readonly ownership: PeriodUpdateConfirmationOwnership;
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

  function isOwned(candidate: PendingPeriodUpdateConfirmation): boolean {
    const { ownership } = candidate;
    return (
      pending?.ownership.requestSequence === ownership.requestSequence &&
      dependencies.getSelectedPeriodId() === ownership.selectedPeriodId &&
      ownership.selectedPeriodId === ownership.targetId &&
      dependencies.summaryRevision.get(ownership.targetId) ===
        ownership.targetRevision &&
      dependencies.summaryRevision.get(ownership.successorId) ===
        ownership.successorRevision
    );
  }

  function getPending(): PendingPeriodUpdateConfirmation | null {
    if (pending != null && !isOwned(pending)) pending = null;
    return pending;
  }

  return {
    get pending() {
      return getPending();
    },
    get confirmSaving() {
      return confirmSaving;
    },
    open(nextPending: PendingPeriodUpdateConfirmation): boolean {
      if (
        nextPending.proposal.target.before.id !==
          nextPending.ownership.targetId ||
        nextPending.proposal.successor.before.id !==
          nextPending.ownership.successorId
      ) {
        return false;
      }
      pending = nextPending;
      if (!isOwned(nextPending)) {
        pending = null;
        return false;
      }
      return true;
    },
    clear(): void {
      pending = null;
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
    owns(candidate: PendingPeriodUpdateConfirmation): boolean {
      return isOwned(candidate);
    },
    finishConfirmation(): void {
      confirmSaving = false;
    },
  };
}

export type PeriodUpdateConfirmationState = ReturnType<
  typeof createPeriodUpdateConfirmationState
>;
