<script lang="ts">
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    getCalendarNavigationTarget,
    getInitialFocusDate,
  } from "./calendar/calendar-navigation";
  import { buildMonths } from "./calendar/calendar-grid";
  import type { DailyRow } from "./calendar/calendar-grid";
  import PeriodCalendarMonth from "./calendar/PeriodCalendarMonth.svelte";
  import CalendarStatusIcon from "./calendar/CalendarStatusIcon.svelte";
  import type { CalendarStatus } from "./calendar/calendar-day-presentation";

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

  const legend: { status: CalendarStatus; label: string }[] = [
    { status: "past", label: "過去" },
    { status: "today", label: "今日" },
    { status: "future", label: "未来" },
    { status: "planned", label: "予定" },
    { status: "recorded", label: "入力済み" },
    { status: "selected", label: "選択中" },
    { status: "disabled", label: "操作不可" },
  ];

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

  const hasToday = $derived(
    today >= startDate && today <= endDate && rowsByDate.has(today),
  );

  function returnToToday(): void {
    if (disabled || !hasToday) return;
    focusedDate = today;
    void tick().then(() => {
      const target = calendarElement?.querySelector<HTMLButtonElement>(
        `[data-testid="calendar-day-${today}"]`,
      );
      target?.focus();
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function activateDate(payload: { readonly date: string }): void {
    if (disabled || payload.date < startDate || payload.date > endDate) return;
    selectedDate = payload.date;
    focusedDate = payload.date;
    requestEdit(payload);
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
  <div class="calendar-heading">
    <h2>日付を選ぶ</h2>
    {#if hasToday}
      <Button type="button" variant="outline" {disabled} onclick={returnToToday}
        >今日へ戻る</Button
      >
    {/if}
  </div>
  {#if disabled}
    <p id="period-calendar-status" role="status">{disabledReason}</p>
  {/if}

  <ul class="calendar-legend" aria-label="カレンダーの記号">
    {#each legend as item (item.status)}
      <li>
        <CalendarStatusIcon status={item.status} /><span>{item.label}</span>
      </li>
    {/each}
  </ul>

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
      focusDate={(payload) => (focusedDate = payload.date)}
      {navigateDate}
    />
  {/each}
</section>

<style>
  section {
    display: grid;
    gap: 0.9rem;
  }

  .calendar-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.8rem;
    list-style: none;
    margin: 0;
    padding: 0;
    color: var(--foreground);
    font-size: 0.75rem;
  }

  .calendar-legend li {
    align-items: center;
    display: inline-flex;
    gap: 0.15rem;
    white-space: nowrap;
  }

  .calendar-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    color: var(--foreground);
    font-size: 1.05rem;
    font-weight: 700;
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
