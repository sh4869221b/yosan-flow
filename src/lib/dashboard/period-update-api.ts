import { Effect } from "effect";
import type { PeriodSummary } from "$lib/dashboard/controller-types";

type PeriodStatus = "active" | "closed";

export type PeriodSnapshot = {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
  readonly status: PeriodStatus;
  readonly predecessorPeriodId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PeriodBoundaryAfter = {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
};

export type PeriodBoundaryUpdateProposal = {
  readonly version: 1;
  readonly target: {
    readonly before: PeriodSnapshot;
    readonly after: PeriodBoundaryAfter;
  };
  readonly successor: {
    readonly before: PeriodSnapshot;
    readonly after: PeriodBoundaryAfter;
  };
};

export type PeriodUpdateRequest = {
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
};

export type PeriodUpdateConfirmationRequest = PeriodUpdateRequest & {
  readonly confirmation: PeriodBoundaryUpdateProposal;
};

export type PeriodUpdateApiOutcome =
  | { readonly kind: "updated"; readonly summary: PeriodSummary }
  | {
      readonly kind: "confirmation-required";
      readonly proposal: PeriodBoundaryUpdateProposal;
    }
  | {
      readonly kind: "error";
      readonly code: string | null;
      readonly message: string;
    };

type JsonObject = Readonly<Record<string, unknown>>;

const confirmationError = {
  code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
  message: "この変更には後続期間の確認が必要です。",
} as const;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseStatus(value: unknown): PeriodStatus | null {
  return value === "active" || value === "closed" ? value : null;
}

function parseSnapshot(value: unknown): PeriodSnapshot | null {
  if (!isObject(value)) return null;
  const status = parseStatus(value.status);
  if (
    !isString(value.id) ||
    !isString(value.startDate) ||
    !isString(value.endDate) ||
    !isNumber(value.budgetYen) ||
    status == null ||
    (value.predecessorPeriodId !== null &&
      !isString(value.predecessorPeriodId)) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt)
  ) {
    return null;
  }
  return {
    id: value.id,
    startDate: value.startDate,
    endDate: value.endDate,
    budgetYen: value.budgetYen,
    status,
    predecessorPeriodId: value.predecessorPeriodId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseAfter(value: unknown): PeriodBoundaryAfter | null {
  if (
    !isObject(value) ||
    !isString(value.id) ||
    !isString(value.startDate) ||
    !isString(value.endDate) ||
    !isNumber(value.budgetYen)
  ) {
    return null;
  }
  return {
    id: value.id,
    startDate: value.startDate,
    endDate: value.endDate,
    budgetYen: value.budgetYen,
  };
}

function parseProposalSide(value: unknown) {
  if (!isObject(value)) return null;
  const before = parseSnapshot(value.before);
  const after = parseAfter(value.after);
  return before == null || after == null ? null : { before, after };
}

function parseProposal(value: unknown): PeriodBoundaryUpdateProposal | null {
  if (!isObject(value) || value.version !== 1) return null;
  const target = parseProposalSide(value.target);
  const successor = parseProposalSide(value.successor);
  if (
    target == null ||
    successor == null ||
    target.before.id !== target.after.id ||
    successor.before.id !== successor.after.id
  ) {
    return null;
  }
  return { version: 1, target, successor };
}

function hasNumberFields(
  value: JsonObject,
  fields: readonly string[],
): boolean {
  return fields.every((field) => isNumber(value[field]));
}

function isFoodPace(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.status === "bonus" ||
      value.status === "adjustment" ||
      value.status === "on_track") &&
    hasNumberFields(value, [
      "baseDailyYen",
      "todayAllowanceYen",
      "usedTodayYen",
      "todayRemainingYen",
      "todayBonusYen",
      "adjustmentYen",
      "totalAdjustmentYen",
    ])
  );
}

function isDailyRow(value: unknown): boolean {
  return (
    isObject(value) &&
    isString(value.date) &&
    (value.label === "today" || value.label === "planned") &&
    isNumber(value.usedYen) &&
    isNumber(value.recommendedYen)
  );
}

function isPeriodSummary(value: unknown): value is PeriodSummary {
  return (
    isObject(value) &&
    isString(value.periodId) &&
    isString(value.startDate) &&
    isString(value.endDate) &&
    isNumber(value.budgetYen) &&
    (value.status === "active" || value.status === "closed") &&
    hasNumberFields(value, [
      "periodLengthDays",
      "spentToDateYen",
      "plannedTotalYen",
      "remainingYen",
      "overspentYen",
      "todayRecommendedYen",
      "varianceFromRecommendationYen",
      "remainingAfterDayYenPreview",
      "daysRemaining",
    ]) &&
    isFoodPace(value.foodPace) &&
    Array.isArray(value.dailyRows) &&
    value.dailyRows.every((row: unknown) => isDailyRow(row))
  );
}

function parseError(body: unknown, fallback: string) {
  if (!isObject(body) || !isObject(body.error)) {
    return { kind: "error", code: null, message: fallback } as const;
  }
  return {
    kind: "error",
    code: isString(body.error.code) ? body.error.code : null,
    message: isString(body.error.message) ? body.error.message : fallback,
  } as const;
}

function parseBody(
  response: Response,
  body: unknown,
  fallback: string,
): PeriodUpdateApiOutcome {
  if (response.status === 200 && isPeriodSummary(body)) {
    return { kind: "updated", summary: body };
  }
  if (
    response.status === 409 &&
    isObject(body) &&
    isObject(body.error) &&
    body.error.code === confirmationError.code &&
    body.error.message === confirmationError.message
  ) {
    const proposal = parseProposal(body.proposal);
    if (proposal != null) {
      return { kind: "confirmation-required", proposal };
    }
  }
  return parseError(body, fallback);
}

export function parsePeriodUpdateResponseEffect(
  response: Response,
  fallback: string,
): Effect.Effect<PeriodUpdateApiOutcome, never> {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: () => fallback,
  }).pipe(
    Effect.match({
      onFailure: () => ({ kind: "error", code: null, message: fallback }),
      onSuccess: (body) => parseBody(response, body, fallback),
    }),
  );
}

export function fetchPeriodUpdateEffect(
  url: string,
  init: RequestInit,
  fallback: string,
): Effect.Effect<PeriodUpdateApiOutcome, never> {
  return Effect.tryPromise({
    try: () => fetch(url, init),
    catch: () => fallback,
  }).pipe(
    Effect.matchEffect({
      onFailure: () =>
        Effect.succeed({ kind: "error", code: null, message: fallback }),
      onSuccess: (response) =>
        parsePeriodUpdateResponseEffect(response, fallback),
    }),
  );
}
