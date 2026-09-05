<script lang="ts">
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import DashboardWorkspace from "$lib/components/dashboard/DashboardWorkspace.svelte";
  import "$lib/components/dashboard/dashboard-shell.css";
  import DayEntryModal from "$lib/components/DayEntryModal.svelte";
  import type { DayEntryCloseReason } from "$lib/dashboard/controller-types";
  import type { PageData } from "./$types";

  type DayEntryOrigin = {
    readonly date: string;
    readonly element: HTMLElement | null;
    readonly periodId: string;
  };

  let { data }: { data: PageData } = $props();
  const controller = createDashboardPageController(() => data);
  let dayEntryOrigin = $state<DayEntryOrigin | null>(null);

  function rememberDayEntryOrigin(origin: DayEntryOrigin): void {
    dayEntryOrigin = origin;
  }

  function restoreDayEntryFocus(
    event: Event,
    reason: DayEntryCloseReason | null,
  ): void {
    event.preventDefault();
    const origin = dayEntryOrigin;
    dayEntryOrigin = null;
    if (reason === "period-change") {
      return;
    }
    if (
      origin?.periodId === controller.selectedPeriodId &&
      origin.element?.isConnected
    ) {
      origin.element.focus();
      return;
    }
    for (const selector of [
      "#period-calendar-heading",
      '[data-testid="period-select"]',
      "#empty-period-heading",
    ]) {
      const target = document.querySelector<HTMLElement>(selector);
      if (target?.isConnected) {
        target.focus();
        return;
      }
    }
  }
</script>

<main class="dashboard-page">
  <DashboardWorkspace
    {controller}
    today={data.today}
    daySaveSuccess={controller.daySaveSuccess}
    onDayEntryRequested={rememberDayEntryOrigin}
  />

  <DayEntryModal
    isOpen={controller.modalOpen}
    date={controller.selectedDate}
    currentUsedYen={controller.selectedRow?.usedYen ?? 0}
    isPlanned={controller.selectedRow?.label === "planned"}
    saving={controller.modalSaving}
    errorMessage={controller.modalError}
    historyErrorMessage={controller.historyError}
    historyLoading={controller.historyLoading}
    historyMutatingId={controller.historyMutatingId}
    histories={controller.histories}
    bind:inputYen={controller.modalInputYen}
    bind:memo={controller.modalMemo}
    previewAfterYen={controller.modalPreviewAfterYen}
    previewRemainingYen={controller.modalPreviewRemainingYen}
    previewRecommendedYen={controller.modalPreviewRecommendedYen}
    close={controller.closeDayEntry}
    onCloseAutoFocus={(event) =>
      restoreDayEntryFocus(event, controller.dayEntryCloseReason)}
    save={controller.submitDayEntry}
    updateHistory={controller.updateHistory}
    deleteHistory={controller.deleteHistory}
  />
</main>
