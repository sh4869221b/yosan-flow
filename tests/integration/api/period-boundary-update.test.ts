import { describe, expect, it } from "vitest";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
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
import { createFixture } from "./periods-fixture";
import "./period-boundary-update-validation-scenarios";
import "./period-boundary-update-d1-scenarios";

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
        message: "この変更には関連する期間の確認が必要です。",
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

  it.each([
    [
      TARGET_ID,
      { startDate: "2026-06-21", endDate: "2026-07-19", budgetYen: 100_000 },
    ],
    [
      SUCCESSOR_ID,
      { startDate: "2026-07-20", endDate: "2026-08-19", budgetYen: 80_000 },
    ],
  ])("confirms an earlier boundary from %s", async (periodId, request) => {
    const fixture = createFixture(NOW);
    await seedLinkedPeriods(fixture);
    const response = await put(fixture, request, periodId);
    expect(response.status).toBe(409);
    const preview: PreviewBody = await response.json();
    expect(Object.keys(preview.proposal).sort()).toEqual([
      "editedPeriodId",
      "next",
      "previous",
    ]);
    expect(preview.proposal).toMatchObject({
      editedPeriodId: periodId,
      previous: { after: { endDate: "2026-07-19" } },
      next: { after: { startDate: "2026-07-20" } },
    });
    expect(await readPeriods(fixture)).toMatchObject([
      { endDate: "2026-07-20" },
      { startDate: "2026-07-21" },
    ]);
    const confirmation = await put(
      fixture,
      { ...request, confirmation: preview.proposal },
      periodId,
    );
    expect(confirmation.status).toBe(200);
    expect(await confirmation.json()).toMatchObject({ periodId });
    expect(await readPeriods(fixture)).toMatchObject([
      { endDate: "2026-07-19" },
      { startDate: "2026-07-20" },
    ]);
  });

  it.each([TARGET_ID, SUCCESSOR_ID])(
    "rejects a stale reverse proposal when %s changes",
    async (changedId) => {
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);
      const request = {
        startDate: "2026-07-20",
        endDate: "2026-08-19",
        budgetYen: 80_000,
      };
      const preview: PreviewBody = await (
        await put(fixture, request, SUCCESSOR_ID)
      ).json();
      const change =
        changedId === TARGET_ID
          ? {
              startDate: "2026-06-21",
              endDate: "2026-07-20",
              budgetYen: 100_001,
            }
          : {
              startDate: "2026-07-21",
              endDate: "2026-08-19",
              budgetYen: 80_001,
            };
      expect((await put(fixture, change, changedId)).status).toBe(200);
      const response = await put(
        fixture,
        { ...request, confirmation: preview.proposal },
        SUCCESSOR_ID,
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "PERIOD_UPDATE_CONFLICT" },
      });
      expect(await readPeriods(fixture)).toMatchObject([
        { endDate: "2026-07-20" },
        { startDate: "2026-07-21" },
      ]);
    },
  );

  it("rejects a reverse proposal on the wrong URL", async () => {
    const fixture = createFixture(NOW);
    await seedLinkedPeriods(fixture);
    const request = {
      startDate: "2026-07-20",
      endDate: "2026-08-19",
      budgetYen: 80_000,
    };
    const preview: PreviewBody = await (
      await put(fixture, request, SUCCESSOR_ID)
    ).json();
    const response = await put(
      fixture,
      { ...request, confirmation: preview.proposal },
      TARGET_ID,
    );
    expect(response.status).toBe(409);
    expect(await readPeriods(fixture)).toMatchObject([
      { endDate: "2026-07-20" },
      { startDate: "2026-07-21" },
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
