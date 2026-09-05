<script lang="ts">
  import { tick } from "svelte";
  import {
    getCalendarNavigationTarget,
    getInitialFocusDate,
  } from "./calendar/calendar-navigation";
  import { buildMonths } from "./calendar/calendar-grid";
  import type { DailyRow } from "./calendar/calendar-grid";
  import PeriodCalendarMonth from "./calendar/PeriodCalendarMonth.svelte";

  type Props = {
    rows?: DailyRow[];
    startDate?: string;
    endDate?: string;
    today: string;
    disabled?: boolean;
    disabledReason?: string;
    requestEdit?: (_payload: { date: string }) => void;
  };

  let {
    rows = [],
    startDate = "",
    endDate = "",
    today,
    disabled = false,
    disabledReason = "",
    requestEdit = () => {},
  }: Props = $props();

  const rowsByDate = $derived(new Map(rows.map((row) => [row.date, row])));
  const months = $derived(buildMonths(startDate, endDate));
  const range = $derived({ startDate, endDate });
  let calendarElement = $state<HTMLElement>();
  let selectedDate = $state<string | null>(null);
  let focusedDate = $state<string | null>(null);
  const initialFocusDate = $derived(
    getInitialFocusDate(selectedDate, today, range),
  );
  const tabStopDate = $derived(focusedDate ?? initialFocusDate);

  $effect(() => {
    if (
      selectedDate !== null &&
      (selectedDate < startDate || selectedDate > endDate)
    ) {
      selectedDate = null;
    }
    if (
      focusedDate !== null &&
      (focusedDate < startDate || focusedDate > endDate)
    ) {
      focusedDate = null;
    }
  });

  function activateDate(payload: { readonly date: string }): void {
    if (disabled || payload.date < startDate || payload.date > endDate) return;
    selectedDate = payload.date;
    focusedDate = payload.date;
    requestEdit(payload);
  }

  function focusDate(payload: { readonly date: string }): void {
    focusedDate = payload.date;
  }

  function navigateDate(payload: {
    readonly currentDate: string;
    readonly key: string;
  }): void {
    if (disabled) return;
    const targetDate = getCalendarNavigationTarget(
      payload.currentDate,
      payload.key,
      range,
    );
    if (targetDate === null) return;
    focusedDate = targetDate;
    void tick().then(() => {
      const target = calendarElement?.querySelector<HTMLButtonElement>(
        `[data-testid="calendar-day-${targetDate}"]`,
      );
      target?.focus();
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
</script>

<section
  bind:this={calendarElement}
  aria-busy={disabled}
  aria-describedby={disabled ? "period-calendar-status" : undefined}
>
  <h2>日付を選ぶ</h2>
  {#if disabled}
    <p id="period-calendar-status" role="status">{disabledReason}</p>
  {/if}

  {#each months as month (month.key)}
    <PeriodCalendarMonth
      {month}
      {rowsByDate}
      {today}
      {selectedDate}
      focusedDate={tabStopDate}
      {disabled}
      disabledDescriptionId="period-calendar-status"
      requestEdit={activateDate}
      {focusDate}
      {navigateDate}
    />
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
