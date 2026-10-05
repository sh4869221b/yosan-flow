<script lang="ts">
  import { tick } from "svelte";
  import "./period-settings-form.css";
  import type {
    ConfirmationResult,
    PeriodUpdateConfirmationState,
  } from "#lib/dashboard/period-update-confirmation-state.svelte.ts";
  import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
  import type { PeriodSettingsState } from "#lib/dashboard/period-settings-state.svelte.ts";
  import PeriodRangePicker from "#lib/components/PeriodRangePicker.svelte";
  import { getPeriodRangeValidation } from "#lib/components/period-range-state.ts";

  type Props = {
    range: PeriodSettingsState["range"];
    confirmation: PeriodUpdateConfirmationState;
    onretry: () => void;
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
    confirmation,
    onretry,
    summary,
    selectedPeriodId,
    visible,
    loading,
    interactionDisabled,
    proposalPending,
    onsubmit,
  }: Props = $props();
  let handledConfirmation: ConfirmationResult | null = null;
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
  const disabled = $derived(
    range.saving ||
      loading ||
      interactionDisabled ||
      confirmation.recovery != null,
  );

  const busy = $derived(range.saving || loading || confirmation.refreshing);
  const showStartError = $derived(
    touchedStart || submitAttempted ? validation.startError : null,
  );
  const showEndError = $derived(
    touchedEnd || submitAttempted ? validation.endError : null,
  );
  const showRangeError = $derived(
    touchedStart || touchedEnd || submitAttempted
      ? validation.rangeError
      : null,
  );
  const waitingForOperation = $derived(
    interactionDisabled && !range.saving && !loading,
  );
  const submitUnavailable = $derived(!range.dirty || range.settingChanged);
  const submitLabel = $derived(
    range.saving ? "保存中..." : loading ? "読込中..." : "期間を反映",
  );
  const canReset = $derived(
    range.dirty ||
      range.serverError ||
      range.success ||
      range.settingChanged ||
      touchedStart ||
      touchedEnd ||
      submitAttempted,
  );
  const showSaved = $derived(
    range.success &&
      !range.saving &&
      !loading &&
      !confirmation.result &&
      !confirmation.refreshing,
  );

  function clearValidation(): void {
    touchedStart = touchedEnd = submitAttempted = false;
  }

  $effect(() => {
    const draft = range.draft;
    if (draft !== editedDraft) clearValidation();
  });

  function edit(value: { startDate: string; endDate: string }): void {
    confirmation.dismissResult();
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
    confirmation.dismissResult();
    range.reset();
    clearValidation();
    focus(document.getElementById("current-period-range-start"));
  }

  function submissionFocusTarget(
    source: HTMLElement | null,
  ): HTMLElement | null | undefined {
    if (!validation.isValid) {
      return document.getElementById(
        validation.startError || validation.rangeError
          ? "current-period-range-start"
          : "current-period-range-end",
      );
    }
    if (range.serverError || range.settingChanged) return source;
    return range.success ? heading : null;
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
    const target = submissionFocusTarget(intent.source);
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

  $effect(() => {
    const result = confirmation.result;
    if (!result || result === handledConfirmation) return;
    handledConfirmation = result;
    if (!visible || selectedPeriodId !== result.periodId) return;
    void tick().then(() => {
      if (
        confirmation.result !== result ||
        !visible ||
        selectedPeriodId !== result.periodId ||
        proposalPending ||
        confirmation.refreshing ||
        loading
      )
        return;
      const target =
        result.kind === "error"
          ? document.getElementById("range-confirmation-error-heading")
          : result.kind === "saved"
            ? heading
            : document.getElementById("current-period-range-start");
      if (target?.isConnected) focus(target);
    });
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    focusIntent = null;
    if (disabled || !range.dirty || range.settingChanged) return;
    confirmation.dismissResult();
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

{#snippet confirmationFeedback()}
  {#if confirmation.result?.kind === "error"}
    <div
      id="range-confirmation-feedback"
      role="alert"
      class="confirmation-error"
    >
      <h3 id="range-confirmation-error-heading" tabindex="-1">
        {confirmation.recovery?.saved
          ? "最新情報を再取得できませんでした"
          : "期間の変更を完了できませんでした"}
      </h3>
      {#if confirmation.recovery}
        <button
          type="button"
          onclick={onretry}
          disabled={confirmation.refreshing}>最新情報を再取得</button
        >
      {/if}
      <p>{confirmation.result.message}</p>
    </div>
  {:else if confirmation.result?.kind === "reedit"}
    <p id="range-confirmation-feedback" role="status">
      最新の期間を取得しました。変更内容を確認し、もう一度編集してください。
    </p>
  {:else if confirmation.result}
    <p id="range-confirmation-feedback" role="status">
      {confirmation.result.kind === "saved"
        ? "期間を保存しました。"
        : "変更を取り消しました。保存はしていません。"}
    </p>
  {/if}
  {#if confirmation.refreshing}<p role="status">
      最新情報を再取得しています。
    </p>{/if}
{/snippet}

<h2 bind:this={heading} id="range-settings-heading" tabindex="-1">期間設定</h2>
<form
  class="period-settings-form"
  bind:this={form}
  aria-labelledby="range-settings-heading"
  aria-busy={busy}
  aria-describedby={confirmation.result
    ? "range-confirmation-feedback"
    : undefined}
  onsubmit={submit}
>
  {@render confirmationFeedback()}
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
    startError={showStartError}
    endError={showEndError}
    rangeError={showRangeError}
    testIdPrefix="current-period-range"
  />
  {#if range.dirty}<p class="notice">未保存の変更があります</p>{/if}
  {#if proposalPending}
    <p class="notice">期間の変更を確認してください。</p>
  {:else if waitingForOperation}
    <p class="notice">ほかの操作が完了するまでお待ちください。</p>
  {/if}
  <div class="actions">
    <button
      type="submit"
      data-testid="current-period-range-apply"
      {disabled}
      aria-disabled={submitUnavailable}
      aria-describedby={range.serverError
        ? "range-settings-server-error"
        : undefined}>{submitLabel}</button
    >
    <button
      class="cancel"
      type="button"
      disabled={disabled || !canReset}
      onclick={reset}
      >{range.settingChanged ? "最新の期間に戻す" : "キャンセル"}</button
    >
  </div>
  {#if range.serverError}<p id="range-settings-server-error" role="alert">
      {#if range.success}期間の保存は完了していますが、最新情報の再取得に失敗しました。{/if}{range.serverError}
    </p>{/if}
  {#if showSaved}
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
  .confirmation-error {
    display: grid;
    gap: 0.75rem;
    color: #8b3a3a;
  }
  .confirmation-error h3 {
    margin: 0;
    font-size: 1rem;
  }
  .confirmation-error button {
    justify-self: start;
  }
</style>
