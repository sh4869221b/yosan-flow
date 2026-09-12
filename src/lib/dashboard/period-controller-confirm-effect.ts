import { Effect } from "effect";
import { periodSummaryUrl } from "$lib/dashboard/api-urls";
import { fetchPeriodUpdateEffect } from "$lib/dashboard/period-update-api";
import type { PeriodUpdateDependencies } from "$lib/dashboard/period-controller-update-effect";
import type {
  PendingPeriodUpdateConfirmation,
  PeriodUpdateConfirmationState,
} from "$lib/dashboard/period-update-confirmation-state.svelte";

type Dependencies = PeriodUpdateDependencies & {
  readonly confirmationState: PeriodUpdateConfirmationState;
  readonly resetRange: () => void;
};

export function createPeriodConfirmationEffects(dependencies: Dependencies) {
  const state = dependencies.confirmationState;
  function refresh(): Effect.Effect<void, never> {
    const recovery = state.beginRecovery();
    if (recovery == null) return Effect.void;
    let accepted = false;
    let dropped = false;
    let error = "最新情報の再取得に失敗しました。";
    return dependencies
      .refreshPeriodListEffect(
        recovery.periodId,
        (message) => {
          error = message;
        },
        undefined,
        (outcome) => {
          accepted = outcome === "accepted";
          dropped = outcome === "dropped";
        },
      )
      .pipe(
        Effect.catchAll((message) =>
          Effect.sync(() => {
            error = message;
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (!state.finishRecovery(recovery)) return;
            state.finishConfirmation();
            if (dropped) {
              state.completeRecovery();
              return;
            }
            if (accepted) {
              state.completeRecovery();
              if (!recovery.saved) dependencies.resetRange();
              state.report({
                periodId: recovery.periodId,
                kind: recovery.saved ? "saved" : "reedit",
              });
            } else {
              state.report({
                periodId: recovery.periodId,
                kind: "error",
                message: recovery.saved
                  ? `期間の保存は完了していますが、最新情報の再取得に失敗しました。${error}`
                  : error,
              });
            }
          }),
        ),
        Effect.asVoid,
      );
  }
  function confirm(
    pending: PendingPeriodUpdateConfirmation,
  ): Effect.Effect<void, never> {
    return dependencies.summaryRevision
      .withMutationSlot(
        pending.ownership.targetId,
        "period",
        Effect.gen(function* () {
          const periodId = pending.ownership.targetId;
          if (!state.owns(pending)) {
            state.clearOwned(pending);
            if (dependencies.getSelectedPeriodId() === periodId) {
              state.recover(periodId, false);
              yield* refresh();
            }
            return;
          }
          const request = dependencies.summaryRequests.start(periodId);
          dependencies.setError(null, "range");
          const mutation = dependencies.summaryRevision.beginMutation(periodId);
          const outcome = yield* fetchPeriodUpdateEffect(
            periodSummaryUrl(periodId),
            {
              body: JSON.stringify(pending.request),
              headers: { "content-type": "application/json" },
              method: "PUT",
            },
            "保存に失敗しました。",
          ).pipe(
            Effect.ensuring(
              Effect.sync(() =>
                dependencies.summaryRevision.completeMutation(
                  periodId,
                  mutation,
                ),
              ),
            ),
          );
          state.clearOwned(pending);
          const current =
            dependencies.getSelectedPeriodId() === periodId &&
            dependencies.summaryRequests.owns(request);
          switch (outcome.kind) {
            case "updated":
              if (current && outcome.summary.periodId === periodId) {
                dependencies.publishSummary(outcome.summary, {
                  operation: "range",
                  payload: pending.request,
                });
              } else dependencies.summaryRevision.advance(periodId);
              dependencies.summaryRevision.advance(
                pending.ownership.successorId,
              );
              if (current) {
                state.recover(periodId, true);
                yield* refresh();
              }
              return;
            case "error":
              if (!current) return;
              if (outcome.code === "PERIOD_UPDATE_CONFLICT") {
                state.recover(periodId, false);
                yield* refresh();
              } else
                state.report({
                  periodId,
                  kind: "error",
                  message: outcome.message,
                });
              return;
            case "confirmation-required":
              if (current)
                state.report({
                  periodId,
                  kind: "error",
                  message: "保存に失敗しました。",
                });
              return;
          }
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(state.finishConfirmation)));
  }
  return { confirm, refresh };
}
