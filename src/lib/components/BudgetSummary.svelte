<script lang="ts">
  import { createEventDispatcher } from "svelte";

  type MonthSummary = {
    yearMonth: string;
    monthStatus: "ready" | "uninitialized";
    budgetYen: number | null;
    budgetStatus: "set" | "unset";
    initializedFromPreviousMonth: boolean;
    carriedFromYearMonth: string | null;
    suggestedInitialBudgetYen: number | null;
    spentToDateYen: number;
    plannedTotalYen: number;
    remainingYen: number;
    overspentYen: number;
    todayRecommendedYen: number;
    daysRemaining: number;
  };

  export let summary: MonthSummary;
  export let saving = false;
  export let errorMessage: string | null = null;

  const dispatch = createEventDispatcher<{ saveBudget: { budgetYen: number } }>();

  let budgetInput = "";

  $: if (summary.budgetYen != null && budgetInput === "") {
    budgetInput = String(summary.budgetYen);
  }

  $: if (summary.monthStatus === "uninitialized" && summary.suggestedInitialBudgetYen != null && budgetInput === "") {
    budgetInput = String(summary.suggestedInitialBudgetYen);
  }

  function submitBudget(event: Event): void {
    event.preventDefault();
    const budgetYen = Number.parseInt(budgetInput, 10);
    if (!Number.isInteger(budgetYen) || budgetYen < 0) {
      return;
    }
    dispatch("saveBudget", { budgetYen });
  }
</script>

<section>
  <h1>Yosan Flow Dashboard ({summary.yearMonth})</h1>

  {#if summary.initializedFromPreviousMonth && summary.carriedFromYearMonth}
    <p>前月 {summary.carriedFromYearMonth} から予算を引き継ぎました。</p>
  {/if}

  {#if summary.monthStatus === "uninitialized" || summary.budgetStatus === "unset"}
    <p>月予算を設定してください</p>
  {/if}

  <p data-testid="budget-value">月予算: {summary.budgetYen == null ? "未設定" : `${summary.budgetYen} 円`}</p>
  <p>今月ここまでの使用額: {summary.spentToDateYen} 円</p>
  <p>今月の総使用予定額: {summary.plannedTotalYen} 円</p>
  <p>月残額: {summary.remainingYen} 円</p>
  <p>超過額: {summary.overspentYen} 円</p>
  <p>今日の推奨日次予算: {summary.todayRecommendedYen} 円</p>
  <p>今日から月末までの残り日数: {summary.daysRemaining} 日</p>

  {#if summary.overspentYen > 0}
    <p role="status">予算を {summary.overspentYen} 円 超過しています。</p>
  {/if}

  {#if errorMessage}
    <p role="alert">{errorMessage}</p>
  {/if}

  <form on:submit={submitBudget}>
    <label>
      月予算 (円)
      <input type="number" min="0" bind:value={budgetInput} />
    </label>
    <button type="submit" disabled={saving}>
      {saving ? "保存中..." : "予算を保存"}
    </button>
  </form>
</section>
