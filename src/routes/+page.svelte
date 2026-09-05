<script lang="ts">
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import DashboardWorkspace from "$lib/components/dashboard/DashboardWorkspace.svelte";
  import "$lib/components/dashboard/dashboard-shell.css";
  import DayEntryModal from "$lib/components/DayEntryModal.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const controller = createDashboardPageController(() => data);
</script>

<main class="dashboard-page">
  <DashboardWorkspace {controller} today={data.today} />

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
