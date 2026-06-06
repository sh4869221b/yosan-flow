<script lang="ts">
  type Props = {
    budgetInput: string;
    saving: boolean;
    loading: boolean;
    errorMessage?: string | null;
    onsubmit: (_event: Event) => void;
  };

  let {
    budgetInput = $bindable(""),
    saving = false,
    loading = false,
    errorMessage = null,
    onsubmit,
  }: Props = $props();
</script>

{#if errorMessage}
  <p role="alert">{errorMessage}</p>
{/if}

<details class="budget-disclosure" open>
  <summary>予算だけ変更</summary>
  <form class="budget-form" {onsubmit}>
    <label>
      期間予算 (円)
      <input
        aria-label="期間予算 (円)"
        type="text"
        inputmode="numeric"
        bind:value={budgetInput}
        disabled={saving || loading}
      />
    </label>
    <button type="submit" disabled={saving || loading}>
      {saving ? "保存中..." : loading ? "読込中..." : "期間を更新"}
    </button>
  </form>
</details>

<style>
  .budget-form {
    align-items: end;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }

  .budget-disclosure {
    border-top: 1px solid #e9e1d6;
    margin-top: 0.9rem;
    padding-top: 0.75rem;
  }

  .budget-disclosure summary {
    color: #4d4036;
    cursor: pointer;
    font-weight: 800;
    list-style: none;
  }

  .budget-disclosure summary::-webkit-details-marker {
    display: none;
  }

  .budget-disclosure summary::after {
    color: #2f2219;
    content: "⌄";
    float: right;
    font-size: 1.1rem;
    line-height: 1;
  }

  .budget-disclosure[open] summary::after {
    content: "⌃";
  }

  input {
    background: #fff;
    border: 1px solid #ded3c6;
    border-radius: 8px;
    box-sizing: border-box;
    color: #2f2219;
    font: inherit;
    max-width: 100%;
    min-height: 2.65rem;
    padding: 0 0.85rem;
    width: 100%;
  }

  label {
    color: #4d4036;
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }

  button {
    background: #2f6d3b;
    border: 0;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
    padding: 0 1rem;
  }

  p[role="alert"] {
    color: #8b3a3a;
    font-weight: 700;
    margin-top: 0.5rem;
  }

  @media (max-width: 760px) {
    .budget-form {
      display: grid;
      justify-content: stretch;
      margin-top: 0.75rem;
    }

    input,
    button {
      min-height: 2.45rem;
    }
  }
</style>
