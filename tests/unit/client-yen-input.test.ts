import { describe, expect, it } from "vitest";
import { parseNonNegativeIntegerYenInput } from "#lib/dashboard/yen-input.ts";

describe("parseNonNegativeIntegerYenInput", () => {
  it.each([
    ["0", 0],
    ["120000", 120000],
    [" 2500 ", 2500],
    ["001000", 1000],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("parses full non-negative integer yen input %s", (input, expected) => {
    expect(parseNonNegativeIntegerYenInput(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "1e3",
    "1000abc",
    "10.5",
    "-1",
    "+1",
    "9007199254740993",
    "1".repeat(309),
  ])("rejects malformed yen input %s", (input) => {
    expect(parseNonNegativeIntegerYenInput(input)).toBeNull();
  });
});
