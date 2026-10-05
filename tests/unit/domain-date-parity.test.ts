import { describe, expect, it } from "vitest";
import {
  getNextPeriodStartDate,
  isDateWithinPeriod,
} from "#lib/server/domain/budget-period.ts";
import { assertValidDate } from "#lib/server/domain/daily-entry.ts";

describe("shared domain calendar-date contract", () => {
  it.each([
    "",
    "2026-2-01",
    "2026-02-29",
    "2024-02-30",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "0099-01-01",
  ])("preserves identical invalid-date messages for %j", (date) => {
    const message = `Invalid date: ${date}`;
    expect(() => assertValidDate(date)).toThrow(message);
    expect(() => getNextPeriodStartDate(date)).toThrow(message);
    expect(() => isDateWithinPeriod(date, "2026-01-01", "2026-12-31")).toThrow(
      message,
    );
    expect(() => isDateWithinPeriod("2026-06-01", date, "2026-12-31")).toThrow(
      message,
    );
    expect(() => isDateWithinPeriod("2026-06-01", "2026-01-01", date)).toThrow(
      message,
    );
  });
  it.each([
    ["2024-02-29", "2024-03-01"],
    ["2026-12-31", "2027-01-01"],
    ["2000-02-29", "2000-03-01"],
  ])("accepts %s and advances its calendar boundary", (date, next) => {
    expect(() => assertValidDate(date)).not.toThrow();
    expect(getNextPeriodStartDate(date)).toBe(next);
    expect(isDateWithinPeriod(date, date, date)).toBe(true);
  });
  it("retains the reversed-period error", () => {
    expect(() =>
      isDateWithinPeriod("2026-06-01", "2026-06-02", "2026-05-31"),
    ).toThrow("Invalid period: 2026-06-02..2026-05-31");
  });
});
