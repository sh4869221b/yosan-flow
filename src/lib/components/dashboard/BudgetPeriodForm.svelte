<script lang="ts">
  import { tick } from "svelte";
  import type { PeriodSummary } from "$lib/dashboard/controller-types";

  type Props = {
    budgetInput: string;
    summary: PeriodSummary | null;
    selectedPeriodId: string | null;
    visible: boolean;
    dirty: boolean;
    saving: boolean;
    loading: boolean;
    interactionDisabled: boolean;
    validationError: string | null;
    serverError: string | null;
    success: boolean;
    settingChanged: boolean;
    onsubmit: () => void;
    onreset: () => void;
  };
  let {
    budgetInput = $bindable(""),
    summary,
    selectedPeriodId,
    visible,
    dirty,
    saving,
    loading,
    interactionDisabled,
    validationError,
    serverError,
    success,
    settingChanged,
    onsubmit,
    onreset,
  }: Props = $props();
  const disabled = $derived(saving || interactionDisabled || loading);

  let form: HTMLFormElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let heading: HTMLHeadingElement | undefined = $state();
  let focusIntent = $state<{
    periodId: string | null;
    source: HTMLElement | null;
  } | null>(null);

  function focus(element: HTMLElement | undefined | null): void {
    element?.focus();
    element?.scrollIntoView({ block: "nearest" });
  }

  function reset(): void {
    focusIntent = null;
    onreset();
    focus(input);
  }

  $effect(() => {
    const intent = focusIntent;
    if (!intent) return;
    if (!visible || selectedPeriodId !== intent.periodId) {
      focusIntent = null;
      return;
    }
    if (saving || loading) return;
    const failed = serverError || settingChanged;
    const target = validationError
      ? input
      : failed
        ? intent.source
        : success
          ? heading
          : null;
    if (!target && !failed) {
      focusIntent = null;
      return;
    }
    void tick().then(() => {
      if (focusIntent !== intent) return;
      focusIntent = null;
      if (!visible || selectedPeriodId !== intent.periodId || disabled) return;
      const active = document.activeElement;
      if (
        !failed ||
        active === document.body ||
        active === intent.source ||
        active?.matches(":disabled")
      ) {
        focus(target?.isConnected ? target : heading);
      }
      form
        ?.querySelector("[role='alert']")
        ?.scrollIntoView({ block: "nearest" });
    });
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    focusIntent = null;
    if (disabled || !dirty || settingChanged) return;
    const active = document.activeElement;
    focusIntent = {
      periodId: selectedPeriodId,
      source:
        active instanceof HTMLElement && form?.contains(active) ? active : null,
    };
    onsubmit();
  }
</script>

<h2 bind:this={heading} id="budget-settings-heading" tabindex="-1">予算設定</h2>
<form
  bind:this={form}
  aria-labelledby="budget-settings-heading"
  aria-busy={saving || loading}
  onsubmit={submit}
>
  {#if summary}
    <p class="context">
      対象期間: {summary.periodId}<br />{summary.startDate} - {summary.endDate}
    </p>
    <p>
      現在の予算 <strong>{summary.budgetYen.toLocaleString("ja-JP")} 円</strong>
    </p>
  {/if}
  {#if settingChanged}
    <p class="notice">
      最新の予算が変更されました。最新の予算に戻してから編集してください。
    </p>
  {/if}
  <label for="budget-settings-input">期間予算 (円)</label>
  <input
    bind:this={input}
    id="budget-settings-input"
    type="text"
    inputmode="numeric"
    bind:value={budgetInput}
    {disabled}
    aria-invalid={validationError != null}
    aria-describedby={validationError
      ? "budget-settings-validation-error"
      : undefined}
  />
  {#if validationError}
    <p id="budget-settings-validation-error" role="alert">{validationError}</p>
  {/if}
  {#if dirty}<p class="notice">未保存の変更があります</p>{/if}
  <div class="actions">
    <button
      type="submit"
      {disabled}
      aria-disabled={!dirty || settingChanged}
      aria-describedby={serverError
        ? "budget-settings-server-error"
        : undefined}
      >{saving ? "保存中..." : loading ? "読込中..." : "期間を更新"}</button
    >
    <button
      class="cancel"
      type="button"
      disabled={disabled ||
        !(dirty || validationError || serverError || success || settingChanged)}
      onclick={reset}
      >{settingChanged ? "最新の予算に戻す" : "キャンセル"}</button
    >
  </div>
  {#if serverError}
    <p id="budget-settings-server-error" role="alert">
      {#if success}予算の保存は完了していますが、最新情報の再取得に失敗しました。
      {/if}{serverError}
    </p>
  {/if}
  {#if success && !saving && !loading}
    <p role="status" aria-live="polite">予算を保存しました。</p>
  {/if}
</form>

<style>
  h2 {
    color: #2f2219;
    font-size: 1.25rem;
    margin: 0;
  }
  form {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  p {
    margin: 0;
  }
  .context {
    color: #4d4036;
    overflow-wrap: anywhere;
  }
  label,
  .notice {
    color: #4d4036;
    font-weight: 700;
  }
  input,
  button {
    border-radius: 8px;
    box-sizing: border-box;
    font: inherit;
    min-height: 2.65rem;
  }
  input {
    background: #fff;
    border: 1px solid #ded3c6;
    color: #2f2219;
    min-width: 0;
    padding: 0 0.85rem;
    width: 100%;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  button {
    background: #2f6d3b;
    border: 1px solid #2f6d3b;
    color: #fff;
    cursor: pointer;
    font-weight: 800;
    padding: 0 1rem;
  }
  .cancel {
    background: #fffdf8;
    border-color: #ded3c6;
    color: #4d4036;
  }
  button:disabled,
  button[aria-disabled="true"] {
    cursor: default;
    opacity: 0.65;
  }
  p[role="alert"] {
    text-wrap: balance;
    color: #8b3a3a;
    font-weight: 700;
  }
  p[role="status"] {
    color: #2f6d3b;
    font-weight: 700;
  }
  @media (max-width: 760px) {
    .actions {
      display: grid;
    }
  }
</style>
