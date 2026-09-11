<script lang="ts">
  import { tick } from "svelte";
  import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
  import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";
  import PeriodRangePicker from "$lib/components/PeriodRangePicker.svelte";
  import { getPeriodRangeValidation } from "$lib/components/period-range-state";

  type Controller = ReturnType<typeof createDashboardPageController>;

  type Props = {
    variant: "empty-state" | "secondary-action";
    controller: Controller;
    onSubmit?: () => void;
    onRetry?: () => void;
    onCancel?: () => void;
  };

  let { variant, controller, onSubmit, onRetry, onCancel }: Props = $props();
  let touchedStart = $state(false);
  let touchedEnd = $state(false);
  let touchedBudget = $state(false);
  let touchedId = $state(false);
  let applyAttempted = $state(false);
  let submitAttempted = $state(false);

  const prefix = $derived(
    variant === "empty-state" ? "initial-period" : "create-period",
  );
  const range = $derived({
    startDate: controller.createStartDate,
    endDate: controller.createEndDate,
  });
  const rangeValidation = $derived(getPeriodRangeValidation(range));
  const budgetError = $derived(
    parseNonNegativeIntegerYenInput(controller.createBudgetInput) == null
      ? "予算は 0 以上の整数で入力してください。"
      : null,
  );
  const idError = $derived(
    controller.createPeriodId.trim() ? null : "期間IDを入力してください。",
  );
  const showStartError = $derived(
    touchedStart || applyAttempted || submitAttempted
      ? rangeValidation.startError
      : null,
  );
  const showEndError = $derived(
    touchedEnd || applyAttempted || submitAttempted
      ? rangeValidation.endError
      : null,
  );
  const showRangeError = $derived(
    touchedStart || touchedEnd || applyAttempted || submitAttempted
      ? rangeValidation.rangeError
      : null,
  );
  const showBudgetError = $derived(
    touchedBudget || submitAttempted ? budgetError : null,
  );
  const showIdError = $derived(touchedId || submitAttempted ? idError : null);
  const busy = $derived(
    controller.createSaving || controller.createdRefreshing,
  );
  const disabled = $derived(
    controller.periodInteractionDisabled || controller.createdRefreshPending,
  );

  function focusField(id: string): void {
    const field = document.getElementById(id);
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  }

  function markBlurred(field: "start" | "end"): void {
    if (field === "start") touchedStart = true;
    else touchedEnd = true;
  }

  function focusRangeError(): void {
    focusField(
      rangeValidation.startError || rangeValidation.rangeError
        ? `${prefix}-range-start`
        : `${prefix}-range-end`,
    );
  }

  function applyRange(): void {
    if (disabled) return;
    applyAttempted = true;
    if (!rangeValidation.isValid) {
      focusRangeError();
      return;
    }
    touchedStart = touchedEnd = applyAttempted = false;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (disabled) return;
    submitAttempted = true;
    if (!rangeValidation.isValid) {
      focusRangeError();
      return;
    }
    if (budgetError || idError) {
      focusField(budgetError ? `${prefix}-budget` : `${prefix}-id`);
      return;
    }
    if (onSubmit) onSubmit();
    else controller.createInitialPeriod();
  }

  async function cancel(): Promise<void> {
    if (disabled) return;
    touchedStart = touchedEnd = touchedBudget = touchedId = false;
    applyAttempted = submitAttempted = false;
    if (variant === "empty-state") {
      controller.resetCreatePeriod();
      await tick();
      focusField(`${prefix}-range-start`);
    } else {
      controller.clearCreateError();
      onCancel?.();
    }
  }

  function retry(): void {
    if (
      controller.periodInteractionDisabled ||
      !controller.createdRefreshPending
    )
      return;
    if (onRetry) onRetry();
    else controller.refreshCreatedPeriod();
  }
</script>

{#if controller.createdRefreshPending}
  <section
    aria-labelledby={`${prefix}-created-heading`}
    aria-busy={controller.createdRefreshing}
  >
    <h2 id={`${prefix}-created-heading`} tabindex="-1">
      期間は作成済みです: {controller.createdPeriodId}
    </h2>
    <p>期間の作成は完了しています。表示を再読み込みしてください。</p>
    {#if controller.createError}
      <p class="error" role="alert">{controller.createError}</p>
    {/if}
    <button
      type="button"
      aria-disabled={controller.periodInteractionDisabled}
      onclick={retry}>表示を再読み込み</button
    >
    {#if controller.createdRefreshing}
      <p role="status">表示を再取得しています...</p>
    {/if}
  </section>
{:else}
  <form onsubmit={submit} aria-busy={busy} novalidate>
    {#if variant === "secondary-action"}
      <p>
        今の期間が終わった後の期間を追加します。開始日は前期間の翌日が基本です。
      </p>
    {/if}
    <h2>期間設定</h2>
    <PeriodRangePicker
      value={range}
      onValueChange={controller.updateCreatePeriodRange}
      onFieldBlur={markBlurred}
      {disabled}
      startId={`${prefix}-range-start`}
      endId={`${prefix}-range-end`}
      startError={showStartError}
      endError={showEndError}
      rangeError={showRangeError}
      testIdPrefix={`${prefix}-range`}
    />
    <button
      type="button"
      data-testid={`${prefix}-range-apply`}
      {disabled}
      onclick={applyRange}>期間を反映</button
    >
    <label for={`${prefix}-budget`}>
      新規予算額 (円)
      <input
        id={`${prefix}-budget`}
        type="text"
        inputmode="numeric"
        bind:value={controller.createBudgetInput}
        aria-invalid={showBudgetError != null}
        aria-describedby={showBudgetError
          ? `${prefix}-budget-error`
          : undefined}
        {disabled}
        onblur={() => (touchedBudget = true)}
      />
    </label>
    <p id={`${prefix}-budget-error`} class="error field-error">
      {showBudgetError ?? ""}
    </p>
    <label for={`${prefix}-id`}>
      期間ID
      <input
        id={`${prefix}-id`}
        type="text"
        bind:value={controller.createPeriodId}
        placeholder="p-2026-04-20"
        aria-invalid={showIdError != null}
        aria-describedby={showIdError ? `${prefix}-id-error` : undefined}
        {disabled}
        onblur={() => (touchedId = true)}
      />
    </label>
    <p id={`${prefix}-id-error`} class="error field-error">
      {showIdError ?? ""}
    </p>
    {#if controller.createError}
      <p role="alert" class="error">{controller.createError}</p>
    {/if}
    <div class="actions">
      <button type="submit" aria-disabled={disabled}>
        {controller.createSaving
          ? "作成中..."
          : controller.createdRefreshing
            ? "表示を再取得中..."
            : "期間を作成"}
      </button>
      <button type="button" class="secondary" {disabled} onclick={cancel}>
        取り消す
      </button>
    </div>
  </form>
{/if}

<style>
  form {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  form > button {
    justify-self: start;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .secondary {
    background: #f5f1e9;
    color: #2f2219;
  }

  input[aria-invalid="true"] {
    border-color: #b33a3a;
  }

  .error {
    color: #9e2e2e;
    font-weight: 700;
    margin: 0;
  }

  .field-error {
    min-height: 1.5em;
  }

  h2 {
    color: #2f2219;
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    letter-spacing: 0;
    line-height: 1.15;
    margin: 0.75rem 0 0;
  }

  label {
    display: grid;
    font-weight: 700;
    gap: 0.35rem;
    margin: 0.75rem 0;
    min-width: 0;
  }

  input,
  button {
    box-sizing: border-box;
    border-radius: 8px;
    font: inherit;
    max-width: 100%;
    min-height: 2.65rem;
  }

  input {
    background: #fff;
    border: 1px solid #ded3c6;
    color: #2f2219;
    padding: 0 0.85rem;
    width: 100%;
  }

  button {
    background: #2f6d3b;
    border: 0;
    color: #fff;
    cursor: pointer;
    font-weight: 800;
    padding: 0 1rem;
  }

  button:disabled,
  button[aria-disabled="true"] {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 760px) {
    input,
    button {
      min-height: 2.45rem;
    }
  }
</style>
