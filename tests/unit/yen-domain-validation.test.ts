import { describe, expect, it } from "vitest";
import { assertValidInputYen } from "#lib/server/domain/daily-entry.ts";
import { assertValidPeriodInput } from "#lib/server/db/budget-period-validation-coordinator.ts";

describe("domain yen validation", () => {
  const validators = [
    { name: "daily entry", validate: assertValidInputYen },
    {
      name: "period budget",
      validate: (value: number) =>
        assertValidPeriodInput("2026-04-20", "2026-05-19", value),
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
