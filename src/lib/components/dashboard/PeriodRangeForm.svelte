<script lang="ts">
  import { tick } from "svelte";
  import type { PeriodSummary } from "$lib/dashboard/controller-types";
  import type { PeriodSettingsState } from "$lib/dashboard/period-settings-state.svelte";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";
  import { getPeriodRangeValidation } from "$lib/components/period-range-state";

  type Props = {
    range: PeriodSettingsState["range"];
    summary: PeriodSummary | null;
    selectedPeriodId: string | null;
    visible: boolean;
    loading: boolean;
    interactionDisabled: boolean;
    proposalPending: boolean;
    onsubmit: () => void;
  };
  let {
    range,
    summary,
    selectedPeriodId,
    visible,
    loading,
    interactionDisabled,
    proposalPending,
    onsubmit,
  }: Props = $props();
  let form: HTMLFormElement | undefined = $state();
  let heading: HTMLHeadingElement | undefined = $state();
  let touchedStart = $state(false);
  let touchedEnd = $state(false);
  let submitAttempted = $state(false);
  let editedDraft: typeof range.draft | undefined;
  let focusIntent = $state<{
    periodId: string | null;
    source: HTMLElement | null;
  } | null>(null);
  const validation = $derived(getPeriodRangeValidation(range.draft));
  const disabled = $derived(range.saving || loading || interactionDisabled);

  function clearValidation(): void {
    touchedStart = touchedEnd = submitAttempted = false;
  }

  $effect(() => {
    const draft = range.draft;
    if (draft !== editedDraft) clearValidation();
  });

  function edit(value: { startDate: string; endDate: string }): void {
    range.edit(value);
    editedDraft = range.draft;
  }

  function focus(element: HTMLElement | null | undefined): void {
    element?.focus();
    element?.scrollIntoView({ block: "nearest" });
  }

  function reset(): void {
    if (disabled) return;
    focusIntent = null;
    range.reset();
    clearValidation();
    focus(document.getElementById("current-period-range-start"));
  }

  $effect(() => {
    const intent = focusIntent;
    if (!intent) return;
    if (!visible || selectedPeriodId !== intent.periodId || proposalPending) {
      focusIntent = null;
      return;
    }
    if (range.saving || loading) return;
    const failed = range.serverError || range.settingChanged;
    const invalid = !validation.isValid;
    const target = invalid
      ? document.getElementById(
          validation.startError || validation.rangeError
            ? "current-period-range-start"
            : "current-period-range-end",
        )
      : failed
        ? intent.source
        : range.success
          ? heading
          : null;
    if (!target && !failed) {
      focusIntent = null;
      return;
    }
    void tick().then(() => {
      if (focusIntent !== intent) return;
      focusIntent = null;
      if (
        !visible ||
        selectedPeriodId !== intent.periodId ||
        proposalPending ||
        disabled
      )
        return;
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
        ?.querySelector(".error, [role='alert']")
        ?.scrollIntoView({ block: "nearest" });
    });
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    focusIntent = null;
    if (disabled || !range.dirty || range.settingChanged) return;
    submitAttempted = true;
    const active = document.activeElement;
    focusIntent = {
      periodId: selectedPeriodId,
      source:
        active instanceof HTMLElement && form?.contains(active) ? active : null,
    };
    if (validation.isValid) onsubmit();
  }
</script>

<h2 bind:this={heading} id="range-settings-heading" tabindex="-1">期間設定</h2>
<form
  bind:this={form}
  aria-labelledby="range-settings-heading"
  aria-busy={range.saving || loading}
  onsubmit={submit}
>
  {#if summary}
    <p class="context">対象期間: {selectedPeriodId}</p>
    <p class="context">
      現在の期間 <strong>{summary.startDate} - {summary.endDate}</strong>
    </p>
  {/if}
  {#if range.settingChanged}
    <p class="notice">
      最新の期間が変更されました。最新の期間に戻してから編集してください。
    </p>
  {/if}
  <p class="notice">変更する期間</p>
  <PeriodRangePicker
    value={range.draft}
    onValueChange={edit}
    onFieldBlur={(field) => {
      if (field === "start") touchedStart = true;
      else touchedEnd = true;
    }}
    {disabled}
    startId="current-period-range-start"
    endId="current-period-range-end"
    startError={touchedStart || submitAttempted ? validation.startError : null}
    endError={touchedEnd || submitAttempted ? validation.endError : null}
    rangeError={touchedStart || touchedEnd || submitAttempted
      ? validation.rangeError
      : null}
    testIdPrefix="current-period-range"
  />
  {#if range.dirty}<p class="notice">未保存の変更があります</p>{/if}
  {#if proposalPending}
    <p class="notice">期間の変更を確認してください。</p>
  {:else if interactionDisabled && !range.saving && !loading}
    <p class="notice">ほかの操作が完了するまでお待ちください。</p>
  {/if}
  <div class="actions">
    <button
      type="submit"
      data-testid="current-period-range-apply"
      {disabled}
      aria-disabled={!range.dirty || range.settingChanged}
      aria-describedby={range.serverError
        ? "range-settings-server-error"
        : undefined}
      >{range.saving
        ? "保存中..."
        : loading
          ? "読込中..."
          : "期間を反映"}</button
    >
    <button
      class="cancel"
      type="button"
      disabled={disabled ||
        !(
          range.dirty ||
          range.serverError ||
          range.success ||
          range.settingChanged ||
          touchedStart ||
          touchedEnd ||
          submitAttempted
        )}
      onclick={reset}
      >{range.settingChanged ? "最新の期間に戻す" : "キャンセル"}</button
    >
  </div>
  {#if range.serverError}<p id="range-settings-server-error" role="alert">
      {#if range.success}期間の保存は完了していますが、最新情報の再取得に失敗しました。{/if}{range.serverError}
    </p>{/if}
  {#if range.success && !range.saving && !loading}
    <p role="status" aria-live="polite">期間を保存しました。</p>
  {/if}
</form>

<style>
  h2 {
    color: #2f2219;
    font-size: 1.25rem;
    margin: 1rem 0 0;
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
  .notice {
    color: #4d4036;
    font-weight: 700;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  button {
    background: #2f6d3b;
    border: 1px solid #2f6d3b;
    border-radius: 8px;
    box-sizing: border-box;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    min-height: 2.65rem;
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
