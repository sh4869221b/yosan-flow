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
  <h2>日付を選ぶ</h2>
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
                      <span class="date-number">{Number(date.slice(8, 10))}</span>
                      <span class="used" data-testid={`used-${date}`}>{rowsByDate.get(date)?.usedYen ?? 0} 円</span>
                      <span class="hint">入力</span>
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
  section {
    display: grid;
    gap: 1rem;
  }

  h2 {
    margin: 0;
  }

  article {
    display: grid;
    gap: 0.6rem;
  }

  h3 {
    font-size: 1.15rem;
    margin: 0;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    border: 1px solid #e4d7c2;
    padding: 0.2rem;
    vertical-align: top;
  }

  th {
    color: #7b6a58;
    font-size: 0.82rem;
    padding: 0.45rem 0.2rem;
  }

  button {
    align-items: flex-start;
    background: #fffdf8;
    border: 1px solid transparent;
    border-radius: 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-height: 5rem;
    padding: 0.55rem;
    text-align: left;
    width: 100%;
  }

  button:hover {
    background: #f7ead2;
    border-color: #c5813c;
  }

  .date-number {
    font-size: 1.15rem;
    font-weight: 900;
  }

  .used {
    color: #2f5c43;
    font-weight: 800;
  }

  .hint {
    color: #9b8062;
    font-size: 0.76rem;
  }

  .today {
    font-weight: 700;
    outline: 3px solid #c5813c;
  }
</style>
