<script lang="ts">
  import CalendarStatusIcon from "./CalendarStatusIcon.svelte";
  import type { CalendarStatus } from "./calendar-day-presentation";

  let { statuses }: { statuses: readonly CalendarStatus[] } = $props();
</script>

<span class="status-icons" aria-hidden="true">
  {#each statuses as status (status)}
    <CalendarStatusIcon {status} />
  {/each}
</span>

<style>
  .status-icons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.05rem;
    justify-content: center;
    max-width: 100%;
  }
</style>
