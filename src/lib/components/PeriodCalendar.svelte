<script lang="ts">
  import { buildMonths } from "./calendar/calendar-grid";
  import type { DailyRow } from "./calendar/calendar-grid";
  import PeriodCalendarMonth from "./calendar/PeriodCalendarMonth.svelte";

  type Props = {
    rows?: DailyRow[];
    startDate?: string;
    endDate?: string;
    loading?: boolean;
    requestEdit?: (_payload: { date: string }) => void;
  };

  let {
    rows = [],
    startDate = "",
    endDate = "",
    loading = false,
    requestEdit = () => {},
  }: Props = $props();

  const rowsByDate = $derived(new Map(rows.map((row) => [row.date, row])));
  const months = $derived(buildMonths(startDate, endDate));
</script>

<section>
  <h2>日付を選ぶ</h2>
  {#if loading}
    <p>読み込み中...</p>
  {/if}

  {#each months as month (month.key)}
    <PeriodCalendarMonth {month} {rowsByDate} {requestEdit} />
  {/each}
</section>

<style>
  section {
    display: grid;
    gap: 0.9rem;
  }

  h2 {
    color: #38291f;
    font-size: 1.05rem;
    margin: 0;
  }

  @media (max-width: 760px) {
    section {
      gap: 0.7rem;
    }

    h2 {
      display: none;
    }
  }
</style>
