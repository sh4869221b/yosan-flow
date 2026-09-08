import { describe, expect, it } from "vitest";
import {
  addDay,
  buildMonths,
  fromDateValue,
  toDateValue,
} from "$lib/components/calendar/calendar-grid";

describe("toDateValue", () => {
  it("converts a YYYY-MM-DD string to a UTC epoch number", () => {
    const result = toDateValue("2026-05-01");
    expect(result).toBe(Date.parse("2026-05-01T00:00:00.000Z"));
  });
});

describe("fromDateValue", () => {
  it("converts a UTC epoch number back to YYYY-MM-DD", () => {
    const epoch = Date.parse("2026-03-10T00:00:00.000Z");
    expect(fromDateValue(epoch)).toBe("2026-03-10");
  });
});

describe("addDay", () => {
  it("adds one day to a date string", () => {
    expect(addDay("2026-05-01")).toBe("2026-05-02");
  });

  it("crosses month boundaries", () => {
    expect(addDay("2026-05-31")).toBe("2026-06-01");
  });

  it("crosses year boundaries", () => {
    expect(addDay("2026-12-31")).toBe("2027-01-01");
  });

  it("handles leap year February", () => {
    expect(addDay("2024-02-28")).toBe("2024-02-29");
    expect(addDay("2025-02-28")).toBe("2025-03-01");
  });
});

describe("buildMonths", () => {
  it.each([
    ["empty start", "", "2026-05-31"],
    ["empty end", "2026-05-01", ""],
    ["reversed range", "2026-05-10", "2026-05-01"],
  ])("returns no months for %s", (_case, start, end) => {
    expect(buildMonths(start, end)).toEqual([]);
  });

  it("returns a single month for a within-month range", () => {
    const months = buildMonths("2026-05-01", "2026-05-03");
    expect(months).toHaveLength(1);
    expect(months[0].key).toBe("2026-05");
    expect(months[0].label).toContain("5");
    expect(months[0].label).toContain("2026");
  });

  it("pads the first week with null cells for days before the start", () => {
    // 2026-05-01 is a Friday (UTCDay = 5)
    const months = buildMonths("2026-05-01", "2026-05-01");
    const week = months[0].weeks[0];
    // Friday is index 5, so 5 null cells before the date
    expect(week.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(week[5]).toBe("2026-05-01");
    expect(week[6]).toBeNull();
  });

  it("pads the last week with null cells for days after the end", () => {
    // 2026-05-04 is a Monday (UTCDay = 1)
    const months = buildMonths("2026-05-04", "2026-05-04");
    const week = months[0].weeks[0];
    // Monday is index 1, so 1 null cell before
    expect(week[0]).toBeNull();
    expect(week[1]).toBe("2026-05-04");
    // Remaining cells should be null
    expect(week.slice(2).every((c) => c === null)).toBe(true);
  });

  it("splits a cross-month range with all dates in each month", () => {
    const months = buildMonths("2026-04-28", "2026-05-03");
    expect(months).toHaveLength(2);
    expect(months[0].key).toBe("2026-04");
    expect(months[1].key).toBe("2026-05");

    const aprilDates = months[0].weeks
      .flat()
      .filter((d): d is string => d !== null);
    const mayDates = months[1].weeks
      .flat()
      .filter((d): d is string => d !== null);
    expect(aprilDates).toEqual(["2026-04-28", "2026-04-29", "2026-04-30"]);
    expect(mayDates).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
  });

  it("handles a full month starting on Sunday", () => {
    // 2026-02-01 is a Sunday (UTCDay = 0)
    const months = buildMonths("2026-02-01", "2026-02-01");
    const week = months[0].weeks[0];
    expect(week[0]).toBe("2026-02-01");
    // No leading null cells
    expect(week.slice(1).every((c) => c === null)).toBe(true);
  });

  it("handles a range that spans three months", () => {
    const months = buildMonths("2026-04-29", "2026-06-02");
    expect(months).toHaveLength(3);
    expect(months[0].key).toBe("2026-04");
    expect(months[1].key).toBe("2026-05");
    expect(months[2].key).toBe("2026-06");
  });

  it("produces weeks of exactly 7 cells each", () => {
    const months = buildMonths("2026-04-01", "2026-04-30");
    for (const month of months) {
      for (const week of month.weeks) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it("uses the locale parameter for labels", () => {
    const months = buildMonths("2026-05-01", "2026-05-01", "en-US");
    expect(months[0].label).toContain("May");
    expect(months[0].label).toContain("2026");
  });
});
