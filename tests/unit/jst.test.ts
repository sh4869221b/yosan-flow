import { describe, expect, it } from "vitest";
import { isFutureDateFromJstToday } from "$lib/server/time/date-comparison";
import { getJstDateParts } from "$lib/server/time/jst-format";

describe("getJstDateParts", () => {
  it("converts UTC instant to JST year-month-day", () => {
    const parts = getJstDateParts(new Date("2026-04-17T15:30:00.000Z"));
    expect(parts.date).toBe("2026-04-18");
    expect(parts.yearMonth).toBe("2026-04");
  });

  it("keeps the same JST date immediately before midnight", () => {
    const parts = getJstDateParts(new Date("2026-04-17T14:59:59.999Z"));
    expect(parts.date).toBe("2026-04-17");
    expect(parts.yearMonth).toBe("2026-04");
  });

  it("advances the JST date at midnight", () => {
    const parts = getJstDateParts(new Date("2026-04-17T15:00:00.000Z"));
    expect(parts.date).toBe("2026-04-18");
    expect(parts.yearMonth).toBe("2026-04");
  });
});

describe("isFutureDateFromJstToday", () => {
  it("treats yesterday as not future in JST", () => {
    expect(isFutureDateFromJstToday("2026-04-17", "2026-04-18")).toBe(false);
  });

  it("treats today as not future in JST", () => {
    expect(isFutureDateFromJstToday("2026-04-18", "2026-04-18")).toBe(false);
  });

  it("treats tomorrow as future in JST", () => {
    expect(isFutureDateFromJstToday("2026-04-19", "2026-04-18")).toBe(true);
  });
});
