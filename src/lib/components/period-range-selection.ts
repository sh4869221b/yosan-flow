import type { DateValue } from "@internationalized/date";
import type { PeriodRange } from "./period-range-state.ts";

type SelectionOptions = {
  readonly getRange: () => PeriodRange;
  readonly getDisabled: () => boolean;
  readonly publish: (_range: PeriodRange) => void;
};

function datesMatch(
  left: DateValue | undefined,
  right: DateValue | undefined,
): boolean {
  return left?.toString() === right?.toString();
}

function rangesMatch(left: PeriodRange, right: PeriodRange): boolean {
  return datesMatch(left.start, right.start) && datesMatch(left.end, right.end);
}

export function createPeriodRangeSelection(options: SelectionOptions) {
  let selectedStart: DateValue | undefined;
  let selectedEnd: DateValue | undefined;

  function publish(nextRange: PeriodRange): void {
    if (!options.getDisabled() && !rangesMatch(nextRange, options.getRange())) {
      options.publish(nextRange);
    }
  }

  return {
    sync(range: PeriodRange): void {
      selectedStart = range.start;
      selectedEnd = range.end;
    },
    onStartValueChange(start: DateValue | undefined): void {
      selectedStart = start;
      selectedEnd = undefined;

      if (!datesMatch(start, options.getRange().start)) {
        publish({ start, end: undefined });
        return;
      }

      // Re-selecting the start can clear or complete the range in the same turn.
      queueMicrotask(() => {
        publish({ start: selectedStart, end: selectedEnd });
      });
    },
    onEndValueChange(end: DateValue | undefined): void {
      selectedEnd = end;
    },
    onValueChange(nextRange: PeriodRange): void {
      if (
        nextRange.start &&
        nextRange.end &&
        rangesMatch(nextRange, { start: selectedStart, end: selectedEnd })
      ) {
        publish(nextRange);
      }
    },
  };
}
