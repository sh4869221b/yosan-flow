import {
  ApiRouteError,
  parseNonNegativeIntegerYen,
  parseRequestBodyObject,
} from "./month";
import { Effect } from "effect";

export function parseDate(date: string | undefined): string {
  if (!date) {
    throw new ApiRouteError(
      400,
      "INVALID_DATE",
      "date は yyyy-mm-dd 形式で指定してください。",
    );
  }

  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!matched) {
    throw new ApiRouteError(
      400,
      "INVALID_DATE",
      "date は yyyy-mm-dd 形式で指定してください。",
    );
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);

  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() + 1 !== month ||
    normalized.getUTCDate() !== day
  ) {
    throw new ApiRouteError(
      400,
      "INVALID_DATE",
      "date は yyyy-mm-dd 形式で指定してください。",
    );
  }

  return date;
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
      memo: memoValue == null ? null : memoValue.trim() || null,
    };
  });
}
