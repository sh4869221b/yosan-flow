<script lang="ts">
  import { Settings2 } from "@lucide/svelte";
  import { createDashboardPageController } from "#lib/dashboard/page-controller.svelte.ts";
  import PeriodRangeForm from "./PeriodRangeForm.svelte";
  import BudgetPeriodForm from "./BudgetPeriodForm.svelte";
  import PeriodBoundaryConfirmationDialog from "./PeriodBoundaryConfirmationDialog.svelte";
  import "./period-action-card.css";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    controller: Controller;
  };

  let { controller }: Props = $props();

  let budgetVisible = $state(false);
  $effect(() => {
    if (controller.confirmation.recoveryRequired)
      controller.refreshPeriodConfirmation();
  });
</script>

<details class="period-action-card" bind:open={budgetVisible}>
  <summary>
    <Settings2 size={20} strokeWidth={2.4} aria-hidden="true" />
    期間の終了日や予算を変更する
  </summary>
  <div class="details-body">
    <section aria-label="予算設定">
      <BudgetPeriodForm
        bind:budgetInput={controller.budget.draft}
        saving={controller.budget.saving}
        loading={controller.summaryLoading}
        interactionDisabled={controller.periodInteractionDisabled}
        summary={controller.summary}
        selectedPeriodId={controller.selectedPeriodId}
        visible={budgetVisible}
        dirty={controller.budget.dirty}
        validationError={controller.budget.validationError}
        serverError={controller.budget.serverError}
        success={controller.budget.success}
        settingChanged={controller.budget.settingChanged}
        onreset={controller.budget.reset}
        onsubmit={controller.saveBudget}
      />
    </section>

    <PeriodRangeForm
      range={controller.range}
      confirmation={controller.confirmation}
      onretry={controller.refreshPeriodConfirmation}
      summary={controller.summary}
      selectedPeriodId={controller.selectedPeriodId}
      visible={budgetVisible}
      loading={controller.summaryLoading}
      interactionDisabled={controller.periodInteractionDisabled}
      proposalPending={controller.periodUpdateProposal != null}
      onsubmit={controller.saveRange}
    />
  </div>
</details>

<PeriodBoundaryConfirmationDialog
  proposal={controller.periodUpdateProposal}
  confirmSaving={controller.confirmSaving}
  confirm={controller.confirmPeriodUpdate}
  cancel={controller.cancelPeriodUpdateConfirmation}
/>
