<script lang="ts">
  import { createEventDispatcher } from "svelte";

  type DailyRow = {
    date: string;
    label: "today" | "planned";
    usedYen: number;
    recommendedYen: number;
  };
  type CalendarMonth = {
    key: string;
    label: string;
    weeks: Array<Array<string | null>>;
  };

  export let rows: DailyRow[] = [];
  export let startDate = "";
  export let endDate = "";
  export let loading = false;

  const dispatch = createEventDispatcher<{ "request-edit": { date: string } }>();

  const jstFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long"
  });

  $: rowsByDate = new Map(rows.map((row) => [row.date, row]));
  $: months = buildMonths(startDate, endDate);

  function toDateValue(date: string): number {
    return Date.parse(`${date}T00:00:00.000Z`);
  }

  function fromDateValue(value: number): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function addDay(date: string): string {
    return fromDateValue(toDateValue(date) + 24 * 60 * 60 * 1000);
  }

  function buildMonthLabel(date: string): string {
    return jstFormatter.format(new Date(`${date}T00:00:00.000Z`));
  }

  function buildMonths(periodStartDate: string, periodEndDate: string): CalendarMonth[] {
    if (!periodStartDate || !periodEndDate || periodStartDate > periodEndDate) {
      return [];
    }

    const monthMap = new Map<string, string[]>();
    let cursor = periodStartDate;
    while (cursor <= periodEndDate) {
      const key = cursor.slice(0, 7);
      const dates = monthMap.get(key);
      if (dates) {
        dates.push(cursor);
      } else {
        monthMap.set(key, [cursor]);
      }
      cursor = addDay(cursor);
    }

    return [...monthMap.entries()].map(([key, dates]) => {
      const firstWeekday = new Date(`${dates[0]}T00:00:00.000Z`).getUTCDay();
      const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
      for (const date of dates) {
        cells.push(date);
      }
      while (cells.length % 7 !== 0) {
        cells.push(null);
      }

      const weeks: Array<Array<string | null>> = [];
      for (let index = 0; index < cells.length; index += 7) {
        weeks.push(cells.slice(index, index + 7));
      }

      return {
        key,
        label: buildMonthLabel(`${key}-01`),
        weeks
      };
    });
  }
</script>

<section>
  <h2>期間カレンダー</h2>
  {#if loading}
    <p>読み込み中...</p>
  {/if}

  {#each months as month}
    <article>
      <h3>{month.label}</h3>
      <table>
        <thead>
          <tr>
            <th>日</th>
            <th>月</th>
            <th>火</th>
            <th>水</th>
            <th>木</th>
            <th>金</th>
            <th>土</th>
          </tr>
        </thead>
        <tbody>
          {#each month.weeks as week}
            <tr>
              {#each week as date}
                <td>
                  {#if date}
                    <button
                      type="button"
                      data-testid={`calendar-day-${date}`}
                      on:click={() => dispatch("request-edit", { date })}
                      class:today={rowsByDate.get(date)?.label === "today"}
                    >
                      <span>{Number(date.slice(8, 10))}</span>
                      <span data-testid={`used-${date}`}>{rowsByDate.get(date)?.usedYen ?? 0} 円</span>
                    </button>
                  {:else}
                    <span aria-hidden="true">-</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </article>
  {/each}
</section>

<style>
  table {
    border-collapse: collapse;
    margin-bottom: 1rem;
    width: 100%;
  }

  th,
  td {
    border: 1px solid #d0d7de;
    padding: 0.25rem;
    vertical-align: top;
  }

  button {
    align-items: flex-start;
    background: transparent;
    border: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 3rem;
    text-align: left;
    width: 100%;
  }

  .today {
    font-weight: 700;
    outline: 2px solid #1f6feb;
  }
</style>
