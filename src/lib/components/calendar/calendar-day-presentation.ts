import type { DailyRow } from "./calendar-grid";

export type CalendarDayPresentationInput = {
  readonly row: DailyRow;
  readonly today: string;
  readonly selected: boolean;
  readonly disabled: boolean;
};

export type CalendarDayPresentation = {
  readonly amountLabel: string;
  readonly accessibleLabel: string;
  readonly isSelected: boolean;
  readonly isDisabled: boolean;
  readonly rowLabel: "今日" | "予定";
  readonly stateLabels: readonly string[];
  readonly temporalLabel: "過去" | "今日" | "未来";
};

export function buildCalendarDayPresentation(
  input: CalendarDayPresentationInput,
): CalendarDayPresentation {
  const temporalLabel =
    input.row.date < input.today
      ? "過去"
      : input.row.date === input.today
        ? "今日"
        : "未来";
  const rowLabelByKind = {
    planned: "予定",
    today: "今日",
  } as const satisfies Record<
    DailyRow["label"],
    CalendarDayPresentation["rowLabel"]
  >;
  const rowLabel = rowLabelByKind[input.row.label];
  const amountLabel = `${input.row.usedYen} 円`;
  const stateLabels = [temporalLabel];

  if (rowLabel !== temporalLabel) {
    stateLabels.push(rowLabel);
  }
  if (input.row.usedYen > 0) {
    stateLabels.push("入力済み");
  }
  if (input.selected) {
    stateLabels.push("選択中");
  }
  if (input.disabled) {
    stateLabels.push("操作不可");
  }

  const accessibleParts = [input.row.date, temporalLabel];
  if (rowLabel !== temporalLabel) {
    accessibleParts.push(rowLabel);
  }
  accessibleParts.push(
    amountLabel,
    ...stateLabels.filter(
      (label) => label !== temporalLabel && label !== rowLabel,
    ),
  );

  return {
    amountLabel,
    accessibleLabel: accessibleParts.join("、"),
    isSelected: input.selected,
    isDisabled: input.disabled,
    rowLabel,
    stateLabels,
    temporalLabel,
  };
}
