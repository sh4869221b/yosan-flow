import type { BudgetPeriodRecord } from "$lib/server/db/budget-period-types";

export type PeriodSnapshot = Readonly<BudgetPeriodRecord>;

export type PeriodUpdateValues = {
  readonly startDate: string;
  readonly endDate: string;
  readonly budgetYen: number;
};

export type PeriodBoundaryAfter = PeriodUpdateValues & {
  readonly id: string;
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

export type PeriodUpdatePreviewRequest = PeriodUpdateValues & {
  readonly confirmation?: never;
};

export type PeriodUpdateConfirmationRequest = PeriodUpdateValues & {
  readonly confirmation: PeriodBoundaryUpdateProposal;
};

export type PeriodUpdateRequest =
  PeriodUpdatePreviewRequest | PeriodUpdateConfirmationRequest;

export type PeriodBoundaryUpdateDecision =
  | { readonly kind: "ordinary-update" }
  | {
      readonly kind: "confirmation-required";
      readonly proposal: PeriodBoundaryUpdateProposal;
    };

export const PERIOD_BOUNDARY_CONFIRMATION_REQUIRED_ERROR = {
  code: "PERIOD_BOUNDARY_CONFIRMATION_REQUIRED",
  message: "この変更には後続期間の確認が必要です。",
} as const;

export const PERIOD_MULTIPLE_SUCCESSORS_ERROR = {
  code: "PERIOD_MULTIPLE_SUCCESSORS",
  message: "後続の予算期間が複数存在するため、変更できません。",
} as const;

export const PERIOD_UPDATE_CONFLICT_ERROR = {
  code: "PERIOD_UPDATE_CONFLICT",
  message: "確認後に予算期間が変更されたため、もう一度操作してください。",
} as const;

export class PeriodMultipleSuccessorsError extends Error {
  readonly code = PERIOD_MULTIPLE_SUCCESSORS_ERROR.code;

  constructor() {
    super(PERIOD_MULTIPLE_SUCCESSORS_ERROR.message);
    this.name = "PeriodMultipleSuccessorsError";
  }
}

export class PeriodUpdateConflictError extends Error {
  readonly code = PERIOD_UPDATE_CONFLICT_ERROR.code;

  constructor() {
    super(PERIOD_UPDATE_CONFLICT_ERROR.message);
    this.name = "PeriodUpdateConflictError";
  }
}
