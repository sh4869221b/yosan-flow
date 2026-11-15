import { describe, expect, it } from "vitest";
import { assertValidInputYen } from "#lib/server/domain/daily-entry.ts";
import { parseNonNegativeIntegerYen } from "#lib/server/validation/month.ts";

describe("domain yen validation", () => {
  const validators = [
    { name: "daily entry", validate: assertValidInputYen },
    {
      name: "period budget",
      validate: (value: number) =>
        parseNonNegativeIntegerYen(value, "budgetYen"),
    },
  ];

  it.each(validators)(
    "preserves exact integer boundaries for $name",
    ({ validate }) => {
      expect(() => validate(0)).not.toThrow();
      expect(() => validate(Number.MAX_SAFE_INTEGER)).not.toThrow();
      expect(() => validate(Number.MAX_SAFE_INTEGER + 1)).toThrow();
      expect(() => validate(1e100)).toThrow();
    },
  );
});
