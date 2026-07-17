import { describe, expect, it } from "vitest";
import {
  SUCCESSOR_ID,
  TARGET_ID,
  UPDATE_REQUEST,
  createD1BoundaryHarness,
  type PreviewBody,
} from "./period-boundary-update-fixture";

const UPDATE_CONFLICT = {
  error: {
    code: "PERIOD_UPDATE_CONFLICT",
    message: "確認後に予算期間が変更されたため、もう一度操作してください。",
  },
} as const;

export function registerPeriodBoundaryD1Scenarios(): void {
  describe("linked period boundary default D1 handler", () => {
    it("uses the same preview and atomic confirmation", async () => {
      // Given
      const harness = createD1BoundaryHarness();

      // When
      const previewResponse = await harness.put(UPDATE_REQUEST);
      const preview: PreviewBody = await previewResponse.json();
      const beforeResponse = await harness.list();
      const confirmResponse = await harness.put({
        ...UPDATE_REQUEST,
        confirmation: preview.proposal,
      });

      // Then
      expect(previewResponse.status).toBe(409);
      await expect(beforeResponse.json()).resolves.toMatchObject({
        periods: [
          { id: TARGET_ID, endDate: "2026-07-20" },
          { id: SUCCESSOR_ID, startDate: "2026-07-21" },
        ],
      });
      expect(confirmResponse.status).toBe(200);
      await expect(confirmResponse.json()).resolves.toMatchObject({
        periodId: TARGET_ID,
        endDate: "2026-07-21",
      });
      await expect((await harness.list()).json()).resolves.toMatchObject({
        periods: [
          { id: TARGET_ID, endDate: "2026-07-21", budgetYen: 110_000 },
          { id: SUCCESSOR_ID, startDate: "2026-07-22", budgetYen: 80_000 },
        ],
      });
    });

    it("rejects stale confirmation", async () => {
      // Given
      const harness = createD1BoundaryHarness();
      const preview: PreviewBody = await (
        await harness.put(UPDATE_REQUEST)
      ).json();
      expect(
        (
          await harness.put(
            {
              startDate: "2026-07-21",
              endDate: "2026-08-19",
              budgetYen: 81_000,
            },
            SUCCESSOR_ID,
          )
        ).status,
      ).toBe(200);

      // When
      const response = await harness.put({
        ...UPDATE_REQUEST,
        confirmation: preview.proposal,
      });

      // Then
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual(UPDATE_CONFLICT);
      await expect((await harness.list()).json()).resolves.toMatchObject({
        periods: [
          { id: TARGET_ID, endDate: "2026-07-20", budgetYen: 100_000 },
          { id: SUCCESSOR_ID, startDate: "2026-07-21", budgetYen: 81_000 },
        ],
      });
    });
  });
}
