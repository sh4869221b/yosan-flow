<script lang="ts">
  import type { PeriodRangeField } from "./period-range-state";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Label } from "#lib/components/ui/label/index.ts";

  type Props = {
    value: { readonly startDate: string; readonly endDate: string };
    disabled: boolean;
    startId: string;
    endId: string;
    startError: string | null;
    endError: string | null;
    rangeError: string | null;
    testIdPrefix: string;
    onValueChange: (_payload: {
      readonly field: PeriodRangeField;
      readonly value: string;
    }) => void;
    onFieldBlur: (_field: PeriodRangeField) => void;
  };

  let {
    value,
    disabled,
    startId,
    endId,
    startError,
    endError,
    rangeError,
    testIdPrefix,
    onValueChange,
    onFieldBlur,
  }: Props = $props();

  const startHelpId = $derived(`${startId}-help`);
  const endHelpId = $derived(`${endId}-help`);
  const rangeErrorId = $derived(`${startId}-range-error`);
  const startDescription = $derived(
    [
      startHelpId,
      startError ? `${startId}-error` : null,
      rangeError ? rangeErrorId : null,
    ]
      .filter((id): id is string => id != null)
      .join(" "),
  );
  const endDescription = $derived(
    [
      endHelpId,
      endError ? `${endId}-error` : null,
      rangeError ? rangeErrorId : null,
    ]
      .filter((id): id is string => id != null)
      .join(" "),
  );
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="grid min-w-0 flex-[1_1_11rem] gap-1.5">
    <Label for={startId}>開始日</Label>
    <Input
      id={startId}
      type="text"
      inputmode="numeric"
      data-testid={`${testIdPrefix}-start`}
      value={value.startDate}
      aria-describedby={startDescription}
      aria-invalid={startError != null || rangeError != null}
      {disabled}
      oninput={(event) =>
        onValueChange({ field: "start", value: event.currentTarget.value })}
      onblur={() => onFieldBlur("start")}
    />
    <span id={startHelpId}>YYYY-MM-DD</span>
  </div>
  <div class="grid min-w-0 flex-[1_1_11rem] gap-1.5">
    <Label for={endId}>終了日</Label>
    <Input
      id={endId}
      type="text"
      inputmode="numeric"
      data-testid={`${testIdPrefix}-end`}
      value={value.endDate}
      aria-describedby={endDescription}
      aria-invalid={endError != null || rangeError != null}
      {disabled}
      oninput={(event) =>
        onValueChange({ field: "end", value: event.currentTarget.value })}
      onblur={() => onFieldBlur("end")}
    />
    <span id={endHelpId}>YYYY-MM-DD</span>
  </div>
</div>

{#if startError}
  <p id={`${startId}-error`} class="error">{startError}</p>
{/if}
{#if endError}
  <p id={`${endId}-error`} class="error">{endError}</p>
{/if}
{#if rangeError}
  <p id={rangeErrorId} class="error">{rangeError}</p>
{/if}

<style>
  span {
    color: var(--muted-foreground);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .error {
    color: var(--invalid);
    font-weight: 700;
    margin: 0;
  }
</style>
