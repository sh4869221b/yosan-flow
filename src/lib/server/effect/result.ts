import { ApiRouteError } from "#lib/server/effect/api-route-error.ts";

type ErrorResponseBody = {
  error: {
    code: string;
    message: string;
  };
};

export type ApiErrorResponseResult = {
  status: number;
  body: ErrorResponseBody;
};

const KNOWN_ERROR_RESPONSES: Record<
  string,
  {
    readonly status: number;
    readonly message: string;
  }
> = {
  PERIOD_NOT_FOUND: {
    status: 404,
    message: "対象の予算期間が見つかりません。",
  },
  DATE_OUT_OF_PERIOD: {
    status: 400,
    message: "指定された date は予算期間の範囲外です。",
  },
  HISTORY_NOT_FOUND: {
    status: 404,
    message: "対象の履歴が見つかりません。",
  },
  DAY_ENTRY_KEY_CONFLICT: {
    status: 409,
    message: "同じ保存キーが別の支出の保存に使用されています。",
  },
  YEN_TOTAL_OUT_OF_RANGE: {
    status: 400,
    message: "日計または期間合計を正確に扱える金額の範囲を超えています。",
  },
  PERIOD_OVERLAP: {
    status: 400,
    message: "予算期間が既存期間と重複しています。",
  },
  PERIOD_CONTINUITY_VIOLATION: {
    status: 400,
    message: "前後の予算期間との連続性が不正です。",
  },
  PERIOD_PREDECESSOR_NOT_FOUND: {
    status: 400,
    message: "前期間が見つかりません。",
  },
  INVALID_PERIOD_RANGE: {
    status: 400,
    message: "開始日と終了日の範囲が不正です。",
  },
  PERIOD_HAS_OUT_OF_RANGE_ENTRIES: {
    status: 400,
    message: "期間外に出る日次データが存在するため、この変更は適用できません。",
  },
  PERIOD_MULTIPLE_SUCCESSORS: {
    status: 409,
    message: "後続の予算期間が複数存在するため、変更できません。",
  },
  PERIOD_UPDATE_CONFLICT: {
    status: 409,
    message: "確認後に予算期間が変更されたため、もう一度操作してください。",
  },
};

export function toApiErrorResponseResult(
  error: unknown,
): ApiErrorResponseResult {
  if (error instanceof ApiRouteError) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message } },
    };
  }

  const code = error instanceof Error && "code" in error ? error.code : null;
  if (typeof code === "string" && Object.hasOwn(KNOWN_ERROR_RESPONSES, code)) {
    const response = KNOWN_ERROR_RESPONSES[code];
    return {
      status: response.status,
      body: { error: { code, message: response.message } },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "サーバーエラーが発生しました。",
      },
    },
  };
}
