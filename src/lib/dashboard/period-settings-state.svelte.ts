import type { PeriodSummary } from "$lib/dashboard/controller-types";
import type { SavePeriodPayload } from "$lib/dashboard/types";
import { parseNonNegativeIntegerYenInput } from "$lib/dashboard/yen-input";
import {
  createPeriodRange,
  getPeriodRangeSelection,
} from "$lib/components/period-range-state";

type RangeDraft = Readonly<{ startDate: string; endDate: string }>;
export type PeriodSetting = "budget" | "range";
export type PeriodSettingsSubmission = {
  readonly operation: PeriodSetting;
  readonly payload: SavePeriodPayload;
};
type Dependencies = {
  readonly getSummary: () => PeriodSummary | null;
  readonly getResetDisabled: () => boolean;
};

function rangeOf(summary: PeriodSummary | null): RangeDraft {
  return {
    startDate: summary?.startDate ?? "",
    endDate: summary?.endDate ?? "",
  };
}
function sameRange(left: RangeDraft, right: RangeDraft): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

export function createPeriodSettingsState(dependencies: Dependencies) {
  const budget = $state({
    draft: String(dependencies.getSummary()?.budgetYen ?? ""),
    saving: false,
    validationError: null as string | null,
    serverError: null as string | null,
    success: false,
    settingChanged: false,
  });
  const range = $state({
    draft: rangeOf(dependencies.getSummary()),
    saving: false,
    validationErrors: {
      startDate: null as string | null,
      endDate: null as string | null,
      range: null as string | null,
    },
    serverError: null as string | null,
    success: false,
    settingChanged: false,
  });

  function resetBudget(summary: PeriodSummary | null): void {
    budget.draft = String(summary?.budgetYen ?? "");
    budget.validationError = budget.serverError = null;
    budget.success = budget.settingChanged = false;
  }
  function resetRange(summary: PeriodSummary | null): void {
    range.draft = rangeOf(summary);
    range.validationErrors = { startDate: null, endDate: null, range: null };
    range.serverError = null;
    range.success = range.settingChanged = false;
  }
  function validateBudget(): number | null {
    if (dependencies.getSummary() == null) return null;
    const value = parseNonNegativeIntegerYenInput(budget.draft);
    budget.validationError =
      value == null ? "予算は 0 以上の整数で入力してください。" : null;
    return budget.settingChanged ? null : value;
  }
  function validateRange(): RangeDraft | null {
    if (dependencies.getSummary() == null) return null;
    const selection = getPeriodRangeSelection(createPeriodRange(range.draft));
    range.validationErrors = {
      startDate: selection.startDate
        ? null
        : "有効な開始日を入力してください。",
      endDate: selection.endDate ? null : "有効な終了日を入力してください。",
      range:
        selection.startDate && selection.endDate && !selection.isValid
          ? "終了日は開始日以降にしてください。"
          : null,
    };
    return selection.isValid && !range.settingChanged
      ? { ...range.draft }
      : null;
  }

  return {
    budget: {
      get draft() {
        return budget.draft;
      },
      set draft(value: string) {
        budget.draft = value;
        budget.serverError = null;
        budget.success = false;
        if (budget.validationError != null) validateBudget();
      },
      get dirty() {
        const summary = dependencies.getSummary();
        return summary == null
          ? budget.draft !== ""
          : parseNonNegativeIntegerYenInput(budget.draft) !== summary.budgetYen;
      },
      get saving() {
        return budget.saving;
      },
      get validationError() {
        return budget.validationError;
      },
      get serverError() {
        return budget.serverError;
      },
      get success() {
        return budget.success;
      },
      get settingChanged() {
        return budget.settingChanged;
      },
      reset(): void {
        if (!dependencies.getResetDisabled())
          resetBudget(dependencies.getSummary());
      },
    },
    range: {
      get draft(): RangeDraft {
        return range.draft;
      },
      edit(value: RangeDraft): void {
        range.draft = { ...value };
        range.serverError = null;
        range.success = false;
        if (
          Object.values(range.validationErrors).some((error) => error != null)
        )
          validateRange();
      },
      get dirty() {
        return !sameRange(range.draft, rangeOf(dependencies.getSummary()));
      },
      get saving() {
        return range.saving;
      },
      get validationErrors(): Readonly<typeof range.validationErrors> {
        return range.validationErrors;
      },
      get serverError() {
        return range.serverError;
      },
      get success() {
        return range.success;
      },
      get settingChanged() {
        return range.settingChanged;
      },
      reset(): void {
        if (!dependencies.getResetDisabled())
          resetRange(dependencies.getSummary());
      },
    },
    setSaving(saving: boolean, operation: PeriodSetting = "range"): void {
      const state = operation === "budget" ? budget : range;
      state.saving = saving;
      if (saving) {
        state.serverError = null;
        state.success = false;
      }
    },
    setError(error: string | null, operation: PeriodSetting = "range"): void {
      (operation === "budget" ? budget : range).serverError = error;
    },
    validateBudget,
    validateRange,
    adopt(
      next: PeriodSummary | null,
      submission?: PeriodSettingsSubmission,
    ): void {
      const previous = dependencies.getSummary();
      if (next == null || previous?.periodId !== next.periodId) {
        resetBudget(next);
        resetRange(next);
        return;
      }
      const ownBudget =
        submission?.operation === "budget" &&
        !budget.settingChanged &&
        next.budgetYen === submission.payload.budgetYen;
      const ownRange =
        submission?.operation === "range" &&
        !range.settingChanged &&
        sameRange(next, submission.payload);
      if (ownBudget) {
        resetBudget(next);
        budget.success = true;
      } else if (previous.budgetYen !== next.budgetYen) {
        if (
          budget.settingChanged ||
          parseNonNegativeIntegerYenInput(budget.draft) !== previous.budgetYen
        ) {
          budget.settingChanged = true;
        } else resetBudget(next);
      }
      if (ownRange) {
        resetRange(next);
        range.success = true;
      } else if (!sameRange(previous, next)) {
        if (range.settingChanged || !sameRange(range.draft, previous)) {
          range.settingChanged = true;
        } else resetRange(next);
      }
    },
  };
}

export type PeriodSettingsState = ReturnType<typeof createPeriodSettingsState>;
