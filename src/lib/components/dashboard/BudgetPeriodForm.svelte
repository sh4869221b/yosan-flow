<script lang="ts">
  import { tick } from "svelte";
  import "./period-settings-form.css";
  import type { PeriodSummary } from "#lib/dashboard/controller-types.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Label } from "#lib/components/ui/label/index.ts";

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

  const canReset = $derived(
    dirty || validationError || serverError || success || settingChanged,
  );
  const showSaved = $derived(success && !saving && !loading);
  const submitLabel = $derived(
    saving ? "保存中..." : loading ? "読込中..." : "期間を更新",
  );

  let form: HTMLFormElement | undefined = $state();
  let input: HTMLInputElement | null = $state(null);
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
  class="period-settings-form"
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
  <Label for="budget-settings-input">期間予算 (円)</Label>
  <Input
    bind:ref={input}
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
    <Button
      type="submit"
      {disabled}
      aria-disabled={!dirty || settingChanged}
      aria-describedby={serverError
        ? "budget-settings-server-error"
        : undefined}>{submitLabel}</Button
    >
    <Button
      variant="outline"
      type="button"
      disabled={disabled || !canReset}
      onclick={reset}
      >{settingChanged ? "最新の予算に戻す" : "キャンセル"}</Button
    >
  </div>
  {#if serverError}
    <p id="budget-settings-server-error" role="alert">
      {#if success}予算の保存は完了していますが、最新情報の再取得に失敗しました。
      {/if}{serverError}
    </p>
  {/if}
  {#if showSaved}
    <p role="status" aria-live="polite">予算を保存しました。</p>
  {/if}
</form>

<style>
  h2 {
    color: var(--foreground);
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }
</style>
