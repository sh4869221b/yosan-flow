import { parseDate } from "@internationalized/date";
import { describe, expect, it } from "vitest";
import { createPeriodRangeSelection } from "#lib/components/period-range-selection.ts";
import type { PeriodRange } from "#lib/components/period-range-state.ts";

function dates(start: string, end = ""): PeriodRange {
  return {
    start: start ? parseDate(start) : undefined,
    end: end ? parseDate(end) : undefined,
  };
}

function createSelection() {
  let range = dates("2026-09-01", "2026-09-30");
  let disabled = false;
  const published: { start: string; end: string }[] = [];
  const selection = createPeriodRangeSelection({
    getRange: () => range,
    getDisabled: () => disabled,
    publish: (next) => {
      published.push({
        start: next.start?.toString() ?? "",
        end: next.end?.toString() ?? "",
      });
      range = next;
    },
  });
  selection.sync(range);

  return {
    selection,
    published,
    reset(next: PeriodRange) {
      range = next;
      selection.sync(next);
    },
    setDisabled(value: boolean) {
      disabled = value;
    },
  };
}

describe("period range selection publishing", () => {
  it("publishes the new start before a complete range without reusing the old end", () => {
    const { selection, published } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-10"));
    expect(published).toEqual([{ start: "2026-09-10", end: "" }]);

    selection.onValueChange(dates("2026-09-10", "2026-09-30"));
    expect(published).toHaveLength(1);
    selection.onEndValueChange(undefined);
    selection.onValueChange(dates("2026-09-10"));
    selection.onEndValueChange(parseDate("2026-09-14"));
    selection.onValueChange(dates("2026-09-10", "2026-09-14"));

    expect(published).toEqual([
      { start: "2026-09-10", end: "" },
      { start: "2026-09-10", end: "2026-09-14" },
    ]);
  });

  it("clears the old end after reselecting the current start and completes a same-day range", async () => {
    const { selection, published } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-01"));
    selection.onEndValueChange(undefined);
    expect(published).toEqual([]);
    await Promise.resolve();
    expect(published).toEqual([{ start: "2026-09-01", end: "" }]);

    selection.onEndValueChange(parseDate("2026-09-01"));
    selection.onValueChange(dates("2026-09-01", "2026-09-01"));
    expect(published).toEqual([
      { start: "2026-09-01", end: "" },
      { start: "2026-09-01", end: "2026-09-01" },
    ]);
  });

  it("does not publish a queued partial value after the range has already completed", async () => {
    const { selection, published } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-01"));
    selection.onEndValueChange(parseDate("2026-09-03"));
    selection.onValueChange(dates("2026-09-01", "2026-09-03"));
    await Promise.resolve();

    expect(published).toEqual([{ start: "2026-09-01", end: "2026-09-03" }]);
  });

  it("keeps successive selections ordered and rejects a stale completed pair", () => {
    const { selection, published } = createSelection();

    for (const [start, end] of [
      ["2026-09-10", "2026-09-12"],
      ["2026-09-15", "2026-09-18"],
    ]) {
      selection.onStartValueChange(parseDate(start));
      selection.onEndValueChange(parseDate(end));
      selection.onValueChange(dates(start, end));
    }
    selection.onValueChange(dates("2026-09-10", "2026-09-12"));

    expect(published).toEqual([
      { start: "2026-09-10", end: "" },
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "2026-09-15", end: "" },
      { start: "2026-09-15", end: "2026-09-18" },
    ]);
  });

  it("uses the latest selection when an earlier same-start notification is still queued", async () => {
    const { selection, published } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-01"));
    selection.onStartValueChange(parseDate("2026-09-10"));
    selection.onEndValueChange(parseDate("2026-09-12"));
    selection.onValueChange(dates("2026-09-10", "2026-09-12"));
    await Promise.resolve();

    expect(published).toEqual([
      { start: "2026-09-10", end: "" },
      { start: "2026-09-10", end: "2026-09-12" },
    ]);
  });

  it("does not restore a queued old selection after the parent resets its period", async () => {
    const { selection, published, reset } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-01"));
    reset(dates("2026-10-01", "2026-10-31"));
    await Promise.resolve();
    selection.onValueChange(dates("2026-09-01", "2026-09-30"));

    expect(published).toEqual([]);
    selection.onStartValueChange(parseDate("2026-10-10"));
    expect(published).toEqual([{ start: "2026-10-10", end: "" }]);
  });

  it("suppresses both queued and immediate publications when saving disables selection", async () => {
    const { selection, published, setDisabled } = createSelection();

    selection.onStartValueChange(parseDate("2026-09-01"));
    setDisabled(true);
    await Promise.resolve();
    selection.onStartValueChange(parseDate("2026-09-10"));
    selection.onEndValueChange(parseDate("2026-09-12"));
    selection.onValueChange(dates("2026-09-10", "2026-09-12"));
    expect(published).toEqual([]);

    setDisabled(false);
    selection.onStartValueChange(parseDate("2026-09-15"));
    expect(published).toEqual([{ start: "2026-09-15", end: "" }]);
  });

  it("compares date values when suppressing duplicate completed notifications", () => {
    const { selection, published } = createSelection();

    selection.onValueChange(dates("2026-09-01", "2026-09-30"));
    selection.onStartValueChange(parseDate("2026-09-10"));
    selection.onEndValueChange(parseDate("2026-09-12"));
    selection.onValueChange(dates("2026-09-10", "2026-09-12"));
    selection.onValueChange(dates("2026-09-10", "2026-09-12"));

    expect(published).toEqual([
      { start: "2026-09-10", end: "" },
      { start: "2026-09-10", end: "2026-09-12" },
    ]);
  });
});
