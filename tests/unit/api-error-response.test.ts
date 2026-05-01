import { describe, expect, it } from "vitest";
import {
  ApiRouteError,
  toApiErrorResponse,
} from "$lib/server/validation/month";

async function parseJson(response: Response): Promise<unknown> {
  return response.json();
}

describe("API error response mapping", () => {
  it("preserves validation route errors", async () => {
    const response = toApiErrorResponse(
      new ApiRouteError(400, "INVALID_BODY", "リクエスト JSON が不正です。"),
    );

    expect(response.status).toBe(400);
    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "INVALID_BODY",
        message: "リクエスト JSON が不正です。",
      },
    });
  });

  it("preserves explicit 5xx route errors", async () => {
    const response = toApiErrorResponse(
      new ApiRouteError(
        503,
        "UPSTREAM_UNAVAILABLE",
        "上流サービスが利用できません。",
      ),
    );

    expect(response.status).toBe(503);
    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "上流サービスが利用できません。",
      },
    });
  });

  it.each([
    {
      code: "PERIOD_NOT_FOUND",
      rawMessage: "period not found: secret-period-id",
      status: 404,
      message: "対象の予算期間が見つかりません。",
    },
    {
      code: "DATE_OUT_OF_PERIOD",
      rawMessage: "DATE_OUT_OF_PERIOD: 2026-04-19 outside period",
      status: 400,
      message: "指定された date は予算期間の範囲外です。",
    },
    {
      code: "PERIOD_OVERLAP",
      rawMessage: "budget period overlap: PERIOD_OVERLAP p-a overlaps p-b",
      status: 400,
      message: "予算期間が既存期間と重複しています。",
    },
    {
      code: "PERIOD_CONTINUITY_VIOLATION",
      rawMessage: "PERIOD_CONTINUITY_VIOLATION: expected next day",
      status: 400,
      message: "前後の予算期間との連続性が不正です。",
    },
    {
      code: "PERIOD_PREDECESSOR_NOT_FOUND",
      rawMessage: "PERIOD_PREDECESSOR_NOT_FOUND: predecessor missing",
      status: 400,
      message: "前期間が見つかりません。",
    },
    {
      code: "INVALID_PERIOD_RANGE",
      rawMessage: "INVALID_PERIOD_RANGE: 2026-05-01..2026-04-30",
      status: 400,
      message: "開始日と終了日の範囲が不正です。",
    },
    {
      code: "PERIOD_HAS_OUT_OF_RANGE_ENTRIES",
      rawMessage: "PERIOD_HAS_OUT_OF_RANGE_ENTRIES: daily totals outside range",
      status: 400,
      message:
        "期間外に出る日次データが存在するため、この変更は適用できません。",
    },
  ])(
    "maps $code domain errors without leaking raw messages",
    async ({ code, rawMessage, status, message }) => {
      const error = new Error(rawMessage);
      (error as Error & { code: string }).code = code;

      const response = toApiErrorResponse(error);

      expect(response.status).toBe(status);
      await expect(parseJson(response)).resolves.toEqual({
        error: {
          code,
          message,
        },
      });
    },
  );

  it("maps known domain codes from messages", async () => {
    const response = toApiErrorResponse(
      new Error("budget period overlap: PERIOD_OVERLAP p-a overlaps p-b"),
    );

    expect(response.status).toBe(400);
    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "PERIOD_OVERLAP",
        message: "予算期間が既存期間と重複しています。",
      },
    });
  });

  it("masks unknown internal errors", async () => {
    const response = toApiErrorResponse(
      new Error("D1 token failed for private table"),
    );

    expect(response.status).toBe(500);
    await expect(parseJson(response)).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバーエラーが発生しました。",
      },
    });
  });
});
