import { describe, expect, it } from "vitest";
import { formatJstDate } from "#lib/server/time/jst-format.ts";

describe("formatJstDate", () => {
  it("keeps the same JST date immediately before midnight", () => {
    expect(formatJstDate(new Date("2026-04-17T14:59:59.999Z"))).toBe(
      "2026-04-17",
    );
  });

  it("advances the JST date at midnight", () => {
    expect(formatJstDate(new Date("2026-04-17T15:00:00.000Z"))).toBe(
      "2026-04-18",
    );
  });
});
