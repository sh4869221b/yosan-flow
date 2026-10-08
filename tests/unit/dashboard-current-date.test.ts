import { expect, it } from "vitest";
import { getDashboardToday } from "#lib/dashboard/dashboard-current-date.ts";
import { getJstToday } from "#lib/dashboard/date.ts";
import { createSummary } from "./day-entry-controller-test-fixtures";

it("changes the JST date at UTC 15:00, including the year boundary", () => {
  expect(getJstToday(new Date("2026-12-31T14:59:59.999Z"))).toBe("2026-12-31");
  expect(getJstToday(new Date("2026-12-31T15:00:00.000Z"))).toBe("2027-01-01");
});

it("uses the accepted server summary's today row ahead of the device date", () => {
  const summary = createSummary(0);
  summary.dailyRows[0].label = "planned";
  summary.dailyRows[1].label = "today";

  expect(getDashboardToday(summary, "2026-07-12")).toBe("2026-07-13");
});

it("uses the fallback when the selected period excludes today or is empty", () => {
  const summary = createSummary(0);
  summary.dailyRows[0].label = "planned";

  expect(getDashboardToday(summary, "2026-07-14")).toBe("2026-07-14");
  expect(getDashboardToday(null, "2026-07-14")).toBe("2026-07-14");
});
