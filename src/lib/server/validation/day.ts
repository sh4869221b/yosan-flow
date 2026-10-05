import {
  ApiRouteError,
  parseNonNegativeIntegerYen,
  parseRequestBodyObject,
} from "./month";
import { Effect } from "effect";
import {
  assertValidDate,
  normalizeMemo,
} from "#lib/server/domain/daily-entry.ts";

export function parseDate(date: string | undefined): string {
  const value = date ?? "";
  try {
    assertValidDate(value);
  } catch {
    throw new ApiRouteError(
      400,
      "INVALID_DATE",
      "date は yyyy-mm-dd 形式で指定してください。",
    );
  }
  return value;
}

export function parseHistoryId(value: string | undefined): string {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRouteError(
      400,
      "INVALID_HISTORY_ID",
      "historyId を指定してください。",
    );
  }
  return value;
}

export type DayMutationInput = {
  inputYen: number;
  memo: string | null;
};

export function parseDayMutationInput(
  request: Request,
): Effect.Effect<DayMutationInput, Error> {
  return Effect.gen(function* () {
    const body = yield* parseRequestBodyObject(request);
    const inputYen = yield* Effect.try({
      try: () => parseNonNegativeIntegerYen(body.inputYen, "inputYen"),
      catch: (error) =>
        error instanceof Error
          ? error
          : new Error("Invalid day mutation input"),
    });

    const memoValue = body.memo;
    if (memoValue != null && typeof memoValue !== "string") {
      return yield* Effect.fail(
        new ApiRouteError(
          400,
          "INVALID_MEMO",
          "memo は文字列で指定してください。",
        ),
      );
    }

    return {
      inputYen,
      memo: normalizeMemo(memoValue),
    };
  });
}
