<script lang="ts">
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import DashboardWorkspace from "$lib/components/dashboard/DashboardWorkspace.svelte";
  import CreatePeriodPanel from "$lib/components/dashboard/CreatePeriodPanel.svelte";
  import DayEntryModal from "$lib/components/DayEntryModal.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const controller = createDashboardPageController(() => data);
</script>

<main>
  {#if controller.periods.length > 0 && controller.summary}
    <DashboardWorkspace {controller} />
  {:else}
    <CreatePeriodPanel variant="empty-state" {controller} />
  {/if}

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
    save={controller.submitDayEntry}
    updateHistory={controller.updateHistory}
    deleteHistory={controller.deleteHistory}
  />
</main>

<style>
  :global(body) {
    background: #f8f5ef;
    color: #2f2219;
    font-family: "Noto Sans JP", "Hiragino Sans", sans-serif;
    margin: 0;
    -webkit-text-size-adjust: 100%;
  }

  main {
    margin: 0 auto;
    max-width: 1480px;
    padding: 1.35rem;
  }

  @media (max-width: 900px) {
    main {
      padding: 1rem;
    }
  }

  @media (max-width: 760px) {
    :global(body) {
      background: #f4f1eb;
    }

    main {
      padding: 0.75rem;
    }
  }
</style>
