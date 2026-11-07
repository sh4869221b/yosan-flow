<script lang="ts">
  import type { CalendarStatus } from "./calendar-day-presentation";

  let { status }: { status: CalendarStatus } = $props();
</script>

<!-- Shapes remain distinct without color and in forced-colors mode. -->
<svg
  class={`status-icon ${status}`}
  data-status={status}
  aria-hidden="true"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if status === "past"}
    <path d="M11 3 5 8l6 5" />
  {:else if status === "today"}
    <circle cx="8" cy="8" r="4" fill="currentColor" />
  {:else if status === "future"}
    <path d="m5 3 6 5-6 5" />
  {:else if status === "planned"}
    <path d="m8 2 6 6-6 6-6-6Z" />
  {:else if status === "recorded"}
    <rect x="4" y="4" width="8" height="8" fill="currentColor" />
  {:else if status === "selected"}
    <path d="m2 8 4 4 8-8" />
  {:else}
    <circle cx="8" cy="8" r="6" />
    <path d="m4 4 8 8" />
  {/if}
</svg>

<style>
  .status-icon {
    color: var(--foreground);
    flex: none;
    height: 0.875rem;
    width: 0.875rem;
  }

  .planned {
    color: var(--planned);
  }

  .recorded,
  .selected,
  .today {
    color: var(--accent-foreground);
  }
</style>
