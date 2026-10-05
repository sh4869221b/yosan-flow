import { describe, expect, it } from "vitest";
import {
  getPeriodRangeCalendarValue,
  getPeriodRangeValidation,
} from "#lib/components/period-range-state.ts";

function rangeStrings(range: ReturnType<typeof getPeriodRangeCalendarValue>) {
  return {
    startDate: range.start?.toString() ?? "",
    endDate: range.end?.toString() ?? "",
  };
}

describe("getPeriodRangeCalendarValue", () => {
  it.each([
    {
      name: "projects an ordered valid pair",
      input: { startDate: "2026-09-01", endDate: "2026-09-30" },
      expected: { startDate: "2026-09-01", endDate: "2026-09-30" },
    },
    {
      name: "projects a same-day pair",
      input: { startDate: "2026-09-15", endDate: "2026-09-15" },
      expected: { startDate: "2026-09-15", endDate: "2026-09-15" },
    },
    {
      name: "keeps a valid start when the end is missing",
      input: { startDate: "2026-09-01", endDate: "" },
      expected: { startDate: "2026-09-01", endDate: "" },
    },
    {
      name: "keeps a valid start when the end is invalid",
      input: { startDate: "2026-09-01", endDate: "2026-02-30" },
      expected: { startDate: "2026-09-01", endDate: "" },
    },
    {
      name: "clears the projection when the start is invalid",
      input: { startDate: "2026-02-30", endDate: "2026-09-30" },
      expected: { startDate: "", endDate: "" },
    },
    {
      name: "clears the projection when the start is missing",
      input: { startDate: "", endDate: "2026-09-30" },
      expected: { startDate: "", endDate: "" },
    },
    {
      name: "clears the projection for a reversed pair",
      input: { startDate: "2026-09-30", endDate: "2026-09-01" },
      expected: { startDate: "", endDate: "" },
    },
  ])("$name", ({ input, expected }) => {
    expect(rangeStrings(getPeriodRangeCalendarValue(input))).toEqual(expected);
  });

  it("does not mutate the raw draft", () => {
    const input = { startDate: "2026-09-30", endDate: "2026-09-01" };

    getPeriodRangeCalendarValue(input);

    expect(input).toEqual({ startDate: "2026-09-30", endDate: "2026-09-01" });
  });
});

describe("existing range validation helpers", () => {
  it("keeps reversed endpoints for validation", () => {
    const validation = getPeriodRangeValidation({
      startDate: "2026-09-30",
      endDate: "2026-09-01",
    });

    expect(validation).toEqual({
      startError: null,
      endError: null,
      rangeError: "終了日は開始日以降にしてください。",
      isValid: false,
    });
  });
});
