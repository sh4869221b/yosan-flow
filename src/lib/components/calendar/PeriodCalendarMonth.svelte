<script lang="ts">
  import type { CalendarMonth, DailyRow } from "./calendar-grid";

  type Props = {
    month: CalendarMonth;
    rowsByDate: Map<string, DailyRow>;
    requestEdit: (_payload: { date: string }) => void;
  };

  let { month, rowsByDate, requestEdit }: Props = $props();
</script>

<article>
  <h3>{month.label}</h3>
  <table>
    <thead>
      <tr>
        <th class="sunday">日</th>
        <th>月</th>
        <th>火</th>
        <th>水</th>
        <th>木</th>
        <th>金</th>
        <th class="saturday">土</th>
      </tr>
    </thead>
    <tbody>
      {#each month.weeks as week, weekIndex (`${month.key}-${weekIndex}`)}
        <tr>
          {#each week as date, dayIndex (date ?? `${month.key}-empty-${weekIndex}-${dayIndex}`)}
            <td>
              {#if date}
                <button
                  type="button"
                  data-testid={`calendar-day-${date}`}
                  onclick={() => requestEdit({ date })}
                  class:today={rowsByDate.get(date)?.label === "today"}
                  class:spent={(rowsByDate.get(date)?.usedYen ?? 0) > 0}
                >
                  <span class="date-number">{Number(date.slice(8, 10))}</span>
                  <span class="used" data-testid={`used-${date}`}
                    >{rowsByDate.get(date)?.usedYen ?? 0} 円</span
                  >
                  <span class="hint">入力</span>
                </button>
              {:else}
                <span class="empty-cell" aria-hidden="true">-</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</article>

<style>
  article {
    display: grid;
    gap: 0.8rem;
  }

  h3 {
    color: #2f2219;
    font-size: 1.25rem;
    font-weight: 900;
    margin: 0;
    text-align: center;
  }

  table {
    border: 1px solid #e6ded4;
    border-collapse: separate;
    border-radius: 10px;
    border-spacing: 0;
    overflow: hidden;
    table-layout: fixed;
    width: 100%;
  }

  th,
  td {
    border: 0;
    border-bottom: 1px solid #e6ded4;
    border-right: 1px solid #e6ded4;
    padding: 0;
    vertical-align: top;
  }

  tr:last-child td {
    border-bottom: 0;
  }

  th:last-child,
  td:last-child {
    border-right: 0;
  }

  th {
    background: #fffdf8;
    color: #33261c;
    font-size: 0.86rem;
    font-weight: 900;
    padding: 0.55rem 0.2rem;
  }

  .sunday {
    color: #d74743;
  }

  .saturday {
    color: #2f76c2;
  }

  button {
    align-items: center;
    background: #fffdf8;
    border: 2px solid transparent;
    border-radius: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    min-height: 5.15rem;
    padding: 0.55rem 0.25rem;
    text-align: center;
    width: 100%;
  }

  button:hover {
    background: #f4fbf1;
    border-color: #83a978;
  }

  .date-number {
    color: #2d2118;
    font-size: 1.05rem;
    font-weight: 900;
  }

  .used {
    color: #8a8179;
    font-size: 0.88rem;
    font-weight: 800;
  }

  .hint {
    color: #74716d;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .today {
    background: #f1f8ef;
    border-color: #7eaa75;
    box-shadow: inset 0 0 0 1px #7eaa75;
    font-weight: 700;
  }

  .spent .used {
    color: #d96945;
  }

  .spent .hint,
  .today .hint {
    color: #2f7a3f;
  }

  .empty-cell {
    align-items: center;
    color: #b0aaa4;
    display: flex;
    min-height: 5.15rem;
    justify-content: center;
  }

  @media (max-width: 760px) {
    h3 {
      font-size: 1.2rem;
    }

    th {
      font-size: 0.82rem;
      padding: 0.5rem 0;
    }

    button {
      gap: 0.12rem;
      min-height: 3.55rem;
      padding: 0.45rem 0.15rem;
    }

    .date-number {
      font-size: 0.85rem;
    }

    .used,
    .hint {
      font-size: 0.65rem;
    }

    .empty-cell {
      min-height: 3.55rem;
    }
  }
</style>
