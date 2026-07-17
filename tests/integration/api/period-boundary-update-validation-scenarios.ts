import { describe, expect, it } from "vitest";
import { runApiEffect } from "$lib/server/effect/runtime";
import {
  NOW,
  SUCCESSOR_ID,
  TARGET_ID,
  UPDATE_REQUEST,
  addSuccessorEntry,
  createD1BoundaryHarness,
  createGapSuccessorRows,
  createMultipleSuccessorRows,
  put,
  putRaw,
  readPeriods,
  seedLinkedPeriods,
  type PreviewBody,
} from "./period-boundary-update-fixture";
import { createFixture } from "./periods-fixture";

const INVALID_BODY = {
  error: { code: "INVALID_BODY", message: "リクエスト JSON が不正です。" },
} as const;
const UPDATE_CONFLICT = {
  error: {
    code: "PERIOD_UPDATE_CONFLICT",
    message: "確認後に予算期間が変更されたため、もう一度操作してください。",
  },
} as const;

export function registerPeriodBoundaryValidationScenarios(): void {
  describe("linked period boundary validation", () => {
    it.each([
      ["missing fields", { version: 1 }],
      ["unsupported version", { version: 2, target: {}, successor: {} }],
      ["boolean-only", true],
    ])("rejects malformed confirmation: %s", async (_label, confirmation) => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);

      // When
      const response = await put(fixture, { ...UPDATE_REQUEST, confirmation });

      // Then
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_BODY);
      expect(await readPeriods(fixture)).toMatchObject([
        { id: TARGET_ID, endDate: "2026-07-20" },
        { id: SUCCESSOR_ID, startDate: "2026-07-21" },
      ]);
    });

    it("rejects invalid JSON as the existing INVALID_BODY response", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);

      // When
      const response = await putRaw(fixture, "{not-json");

      // Then
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(INVALID_BODY);
    });

    it("rejects extra and tampered proposal fields without writing", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);
      const preview: PreviewBody = await (
        await put(fixture, UPDATE_REQUEST)
      ).json();

      // When
      const extraResponse = await put(fixture, {
        ...UPDATE_REQUEST,
        confirmation: { ...preview.proposal, extra: "drift" },
      });
      const tamperedResponse = await put(fixture, {
        ...UPDATE_REQUEST,
        confirmation: {
          ...preview.proposal,
          successor: {
            ...preview.proposal.successor,
            after: {
              ...preview.proposal.successor.after,
              startDate: "2026-07-23",
            },
          },
        },
      });

      // Then
      expect(extraResponse.status).toBe(400);
      await expect(extraResponse.json()).resolves.toEqual(INVALID_BODY);
      expect(tamperedResponse.status).toBe(409);
      await expect(tamperedResponse.json()).resolves.toEqual(UPDATE_CONFLICT);
      expect(await readPeriods(fixture)).toMatchObject([
        { id: TARGET_ID, endDate: "2026-07-20" },
        { id: SUCCESSOR_ID, startDate: "2026-07-21" },
      ]);
    });

    it("never falls through to ordinary update when confirmation becomes ordinary", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);
      const preview: PreviewBody = await (
        await put(fixture, UPDATE_REQUEST)
      ).json();

      // When
      const response = await put(fixture, {
        ...UPDATE_REQUEST,
        endDate: "2026-07-19",
        confirmation: preview.proposal,
      });

      // Then
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual(UPDATE_CONFLICT);
      expect(await readPeriods(fixture)).toMatchObject([
        { id: TARGET_ID, endDate: "2026-07-20", budgetYen: 100_000 },
        { id: SUCCESSOR_ID, startDate: "2026-07-21", budgetYen: 80_000 },
      ]);
    });

    it("rejects multiple successors and invalid derived ranges with exact errors", async () => {
      // Given
      const multiple = createD1BoundaryHarness({
        periods: createMultipleSuccessorRows(),
      });
      const invalidRange = createD1BoundaryHarness();

      // When
      const multipleResponse = await multiple.put(UPDATE_REQUEST);
      const invalidRangeResponse = await invalidRange.put({
        ...UPDATE_REQUEST,
        endDate: "2026-08-19",
      });

      // Then
      expect(multipleResponse.status).toBe(409);
      await expect(multipleResponse.json()).resolves.toEqual({
        error: {
          code: "PERIOD_MULTIPLE_SUCCESSORS",
          message: "後続の予算期間が複数存在するため、変更できません。",
        },
      });
      expect(invalidRangeResponse.status).toBe(400);
      await expect(invalidRangeResponse.json()).resolves.toEqual({
        error: {
          code: "INVALID_PERIOD_RANGE",
          message: "開始日と終了日の範囲が不正です。",
        },
      });
    });

    it("rejects displaced successor data before returning a proposal", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);
      expect((await addSuccessorEntry(fixture)).status).toBe(200);

      // When
      const response = await put(fixture, UPDATE_REQUEST);

      // Then
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
          message:
            "期間外に出る日次データが存在するため、この変更は適用できません。",
        },
      });
      expect(await readPeriods(fixture)).toMatchObject([
        { id: TARGET_ID, endDate: "2026-07-20" },
        { id: SUCCESSOR_ID, startDate: "2026-07-21" },
      ]);
    });

    it("rejects confirm-time successor data atomically", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);
      const preview: PreviewBody = await (
        await put(fixture, UPDATE_REQUEST)
      ).json();
      expect((await addSuccessorEntry(fixture)).status).toBe(200);

      // When
      const response = await put(fixture, {
        ...UPDATE_REQUEST,
        confirmation: preview.proposal,
      });

      // Then
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual(UPDATE_CONFLICT);
      expect(await readPeriods(fixture)).toMatchObject([
        { id: TARGET_ID, endDate: "2026-07-20" },
        { id: SUCCESSOR_ID, startDate: "2026-07-21" },
      ]);
    });

    it("keeps ordinary updates on the direct summary contract", async () => {
      // Given
      const fixture = createFixture(NOW);
      await seedLinkedPeriods(fixture);

      // When
      const budgetResponse = await put(fixture, {
        startDate: "2026-06-21",
        endDate: "2026-07-20",
        budgetYen: 111_000,
      });
      const startResponse = await put(fixture, {
        startDate: "2026-06-22",
        endDate: "2026-07-20",
        budgetYen: 111_000,
      });

      // Then
      expect(budgetResponse.status).toBe(200);
      await expect(budgetResponse.json()).resolves.toMatchObject({
        periodId: TARGET_ID,
        budgetYen: 111_000,
      });
      expect(startResponse.status).toBe(200);
      await expect(startResponse.json()).resolves.toMatchObject({
        periodId: TARGET_ID,
        startDate: "2026-06-22",
      });
    });

    it("keeps shortening, non-overlap, and no-successor requests off the proposal path", async () => {
      // Given
      const linked = createFixture(NOW);
      await seedLinkedPeriods(linked);
      const gap = createD1BoundaryHarness({
        periods: createGapSuccessorRows(),
      });
      const standalone = createFixture(NOW);
      await runApiEffect(
        standalone.services.createPeriod({
          id: TARGET_ID,
          startDate: "2026-06-21",
          endDate: "2026-07-20",
          budgetYen: 100_000,
        }),
      );

      // When
      const shortening = await put(linked, {
        ...UPDATE_REQUEST,
        endDate: "2026-07-19",
      });
      const nonOverlap = await gap.put({
        ...UPDATE_REQUEST,
        endDate: "2026-07-19",
      });
      const noSuccessor = await put(standalone, UPDATE_REQUEST);

      // Then
      for (const response of [shortening, nonOverlap]) {
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          error: {
            code: "PERIOD_CONTINUITY_VIOLATION",
            message: "前後の予算期間との連続性が不正です。",
          },
        });
      }
      expect(noSuccessor.status).toBe(200);
      await expect(noSuccessor.json()).resolves.toMatchObject({
        periodId: TARGET_ID,
        endDate: "2026-07-21",
      });
    });
  });
}
