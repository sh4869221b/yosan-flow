import { describe, expect, it } from "vitest";
import {
  getCalendarNavigationTarget,
  getInitialFocusDate,
  type CalendarDateRange,
} from "$lib/components/calendar/calendar-navigation";

const range: CalendarDateRange = {
  startDate: "2026-01-20",
  endDate: "2026-03-10",
};

describe("getInitialFocusDate", () => {
  it("prefers a selected date that is inside the period", () => {
    expect(getInitialFocusDate("2026-02-04", "2026-02-05", range)).toBe(
      "2026-02-04",
    );
  });

  it("falls back to today and then the period start when candidates are outside", () => {
    expect(getInitialFocusDate("2026-01-01", "2026-02-05", range)).toBe(
      "2026-02-05",
    );
    expect(getInitialFocusDate("2026-01-01", "2026-04-05", range)).toBe(
      "2026-01-20",
    );
  });

  it("returns no tab candidate for an empty period", () => {
    expect(
      getInitialFocusDate(null, "2026-02-05", {
        startDate: "2026-03-10",
        endDate: "2026-03-01",
      }),
    ).toBeNull();
  });
});

describe("getCalendarNavigationTarget", () => {
  it("moves one day or one week with arrow keys and clamps at the period edges", () => {
    expect(getCalendarNavigationTarget("2026-01-31", "ArrowRight", range)).toBe(
      "2026-02-01",
    );
    expect(getCalendarNavigationTarget("2026-01-31", "ArrowDown", range)).toBe(
      "2026-02-07",
    );
    expect(
      getCalendarNavigationTarget(range.startDate, "ArrowLeft", range),
    ).toBe(range.startDate);
    expect(
      getCalendarNavigationTarget(range.endDate, "ArrowRight", range),
    ).toBe(range.endDate);
  });

  it("moves to the Sunday or Saturday of the current week", () => {
    expect(getCalendarNavigationTarget("2026-02-04", "Home", range)).toBe(
      "2026-02-01",
    );
    expect(getCalendarNavigationTarget("2026-02-04", "End", range)).toBe(
      "2026-02-07",
    );
  });

  it("moves by month while clamping dates that do not exist", () => {
    expect(getCalendarNavigationTarget("2026-01-31", "PageDown", range)).toBe(
      "2026-02-28",
    );
    expect(
      getCalendarNavigationTarget("2024-01-31", "PageDown", {
        startDate: "2024-01-01",
        endDate: "2024-03-31",
      }),
    ).toBe("2024-02-29");
  });

  it("crosses year boundaries and clamps page navigation to the period", () => {
    expect(
      getCalendarNavigationTarget("2026-12-31", "PageDown", {
        startDate: "2026-01-01",
        endDate: "2027-02-10",
      }),
    ).toBe("2027-01-31");
    expect(getCalendarNavigationTarget("2026-01-20", "PageUp", range)).toBe(
      range.startDate,
    );
  });

  it("does not handle activation or tab keys", () => {
    expect(
      getCalendarNavigationTarget("2026-02-04", "Enter", range),
    ).toBeNull();
    expect(getCalendarNavigationTarget("2026-02-04", " ", range)).toBeNull();
    expect(getCalendarNavigationTarget("2026-02-04", "Tab", range)).toBeNull();
  });
});
