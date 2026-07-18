<script lang="ts">
  import type { PeriodRangeField } from "./period-range-state";

  type DateInputPayload = {
    readonly field: PeriodRangeField;
    readonly value: string;
  };

  type Props = {
    selectedStartDate?: string;
    selectedEndDate?: string;
    disabled?: boolean;
    testIdPrefix?: string;
    input?: (_payload: DateInputPayload) => void;
  };

  let {
    selectedStartDate = "",
    selectedEndDate = "",
    disabled = false,
    testIdPrefix = "period-range",
    input = () => {},
  }: Props = $props();
</script>

<p>
  <label>
    開始日
    <input
      type="date"
      data-testid={`${testIdPrefix}-start`}
      value={selectedStartDate}
      max={selectedEndDate || undefined}
      {disabled}
      oninput={(event) =>
        input({ field: "start", value: event.currentTarget.value })}
    />
  </label>
  <label>
    終了日
    <input
      type="date"
      data-testid={`${testIdPrefix}-end`}
      value={selectedEndDate}
      min={selectedStartDate || undefined}
      {disabled}
      oninput={(event) =>
        input({ field: "end", value: event.currentTarget.value })}
    />
  </label>
</p>

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
</style>
