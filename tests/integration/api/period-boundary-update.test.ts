import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import { registerPeriodBoundaryD1Scenarios } from "./period-boundary-update-d1-scenarios";
import {
  NOW,
  SUCCESSOR_ID,
  TARGET_ID,
  UPDATE_REQUEST,
  put,
  readPeriods,
  seedLinkedPeriods,
  type PreviewBody,
} from "./period-boundary-update-fixture";
import { registerPeriodBoundaryValidationScenarios } from "./period-boundary-update-validation-scenarios";
import { createFixture } from "./periods-fixture";

describe("linked period boundary PUT workflow", () => {
  it("returns a proposal without writing and confirms it atomically", async () => {
    // Given
    const fixture = createFixture(NOW);
    await seedLinkedPeriods(fixture);

    // When
    const previewResponse = await put(fixture, UPDATE_REQUEST);

    // Then
    expect(previewResponse.status).toBe(409);
    const previewBody: PreviewBody = await previewResponse.json();
    expect(previewBody).toEqual({
      error: {
        code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
        message: "この変更には後続期間の確認が必要です。",
      },
      proposal: expect.any(Object),
    });
    expect(await readPeriods(fixture)).toMatchObject([
      { id: TARGET_ID, endDate: "2026-07-20", budgetYen: 100_000 },
      { id: SUCCESSOR_ID, startDate: "2026-07-21", budgetYen: 80_000 },
    ]);

    const confirmResponse = await put(fixture, {
      ...UPDATE_REQUEST,
      confirmation: previewBody.proposal,
    });
    expect(confirmResponse.status).toBe(200);
    await expect(confirmResponse.json()).resolves.toMatchObject({
      periodId: TARGET_ID,
      endDate: "2026-07-21",
      budgetYen: 110_000,
    });
    expect(await readPeriods(fixture)).toMatchObject([
      { id: TARGET_ID, endDate: "2026-07-21", budgetYen: 110_000 },
      { id: SUCCESSOR_ID, startDate: "2026-07-22", budgetYen: 80_000 },
    ]);
  });

  it("rejects stale or impossible confirmations", async () => {
    // Given
    const fixture = createFixture(NOW);
    await seedLinkedPeriods(fixture);
    const request = {
      startDate: "2026-06-21",
      endDate: "2026-07-21",
      budgetYen: 100_000,
    } as const;
    const previewBody: PreviewBody = await (await put(fixture, request)).json();
    await runApiEffect(
      fixture.services.updatePeriod(SUCCESSOR_ID, {
        startDate: "2026-07-21",
        endDate: "2026-08-19",
        budgetYen: 81_000,
      }),
    );

    // When
    const response = await put(fixture, {
      ...request,
      confirmation: previewBody.proposal,
    });

    // Then
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PERIOD_UPDATE_CONFLICT",
        message: "確認後に予算期間が変更されたため、もう一度操作してください。",
      },
    });
    expect(await readPeriods(fixture)).toMatchObject([
      { id: TARGET_ID, endDate: "2026-07-20", budgetYen: 100_000 },
      { id: SUCCESSOR_ID, startDate: "2026-07-21", budgetYen: 81_000 },
    ]);
  });
});

registerPeriodBoundaryValidationScenarios();
registerPeriodBoundaryD1Scenarios();
