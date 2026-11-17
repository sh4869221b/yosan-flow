<script lang="ts">
  import { RangeCalendar } from "#lib/components/ui/range-calendar/index.ts";
  import { createPeriodRangeSelection } from "./period-range-selection.ts";
  import { MIN_PERIOD_DATE, type PeriodRange } from "./period-range-state.ts";

  type Props = {
    range: PeriodRange;
    disabled?: boolean;
    valueChange?: (_value: PeriodRange) => void;
  };

  let { range, disabled = false, valueChange = () => {} }: Props = $props();
  const selection = createPeriodRangeSelection({
    getRange: () => range,
    getDisabled: () => disabled,
    publish: (value) => valueChange(value),
  });

  $effect(() => selection.sync(range));
</script>

<RangeCalendar
  value={range}
  onValueChange={selection.onValueChange}
  onStartValueChange={selection.onStartValueChange}
  onEndValueChange={selection.onEndValueChange}
  locale="ja-JP"
  minValue={MIN_PERIOD_DATE}
  weekdayFormat="short"
  fixedWeeks={true}
  preventDeselect={true}
  numberOfMonths={1}
  {disabled}
  calendarLabel="予算期間"
  previousLabel="前の月"
  nextLabel="次の月"
/>
