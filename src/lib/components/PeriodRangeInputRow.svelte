<script lang="ts">
  import type { PeriodRangeField } from "./period-range-state";

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

<p>
  <label for={startId}>
    開始日
    <input
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
  </label>
  <label for={endId}>
    終了日
    <input
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
  </label>
</p>

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
  p {
    align-items: end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0;
  }

  label {
    color: #4d4036;
    display: grid;
    flex: 1 1 11rem;
    font-weight: 700;
    gap: 0.35rem;
    min-width: 0;
  }

  span {
    color: #796b5e;
    font-size: 0.875rem;
    font-weight: 600;
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

  input[aria-invalid="true"] {
    border-color: #b33a3a;
  }

  .error {
    color: #9e2e2e;
    font-weight: 700;
    margin: 0;
  }
</style>
