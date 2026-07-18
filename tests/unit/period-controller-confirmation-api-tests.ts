import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { parsePeriodUpdateResponseEffect } from "$lib/dashboard/period-update-api";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import {
  confirmationBody,
  proposal,
} from "./period-controller-confirmation-fixture";

export function registerPeriodUpdateApiParserTests(): void {
  describe("period update API parser", () => {
    it("distinguishes an exact preview, a direct summary, and ordinary errors", async () => {
      const summary = createSummary(0);
      const updated = await Effect.runPromise(
        parsePeriodUpdateResponseEffect(jsonResponse(summary), "fallback"),
      );
      const confirmation = await Effect.runPromise(
        parsePeriodUpdateResponseEffect(
          jsonResponse(confirmationBody, 409),
          "fallback",
        ),
      );
      const ordinary = await Effect.runPromise(
        parsePeriodUpdateResponseEffect(
          jsonResponse(
            { error: { code: "INVALID_PERIOD_RANGE", message: "invalid" } },
            400,
          ),
          "fallback",
        ),
      );
      const malformedProposal = await Effect.runPromise(
        parsePeriodUpdateResponseEffect(
          jsonResponse({ ...confirmationBody, proposal: { version: 2 } }, 409),
          "fallback",
        ),
      );
      const malformedSuccess = await Effect.runPromise(
        parsePeriodUpdateResponseEffect(
          jsonResponse({ periodId: 1 }),
          "fallback",
        ),
      );

      expect(updated).toEqual({ kind: "updated", summary });
      expect(confirmation).toEqual({ kind: "confirmation-required", proposal });
      expect(ordinary).toEqual({
        kind: "error",
        code: "INVALID_PERIOD_RANGE",
        message: "invalid",
      });
      expect(malformedProposal).toEqual({
        kind: "error",
        code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
        message: "この変更には後続期間の確認が必要です。",
      });
      expect(malformedSuccess).toEqual({
        kind: "error",
        code: null,
        message: "fallback",
      });
    });
  });
}
