import { describe, expect, it } from "vitest";
import { getJstDateParts, isFutureDateFromJstToday } from "$lib/server/time/jst";

describe("getJstDateParts", () => {
  it("converts UTC instant to JST year-month-day", () => {
    const parts = getJstDateParts(new Date("2026-04-17T15:30:00.000Z"));
    expect(parts.date).toBe("2026-04-18");
    expect(parts.yearMonth).toBe("2026-04");
  });
});

describe("isFutureDateFromJstToday", () => {
  it("treats tomorrow as future in JST", () => {
    expect(isFutureDateFromJstToday("2026-04-19", "2026-04-18")).toBe(true);
  });
});
