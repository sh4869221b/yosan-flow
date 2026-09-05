import { describe, expect, it } from "vitest";
import {
  buildCalendarDayPresentation,
  type CalendarDayPresentationInput,
} from "$lib/components/calendar/calendar-day-presentation";

const present = (
  overrides: Partial<CalendarDayPresentationInput> = {},
): CalendarDayPresentationInput => ({
  row: {
    date: "2026-09-05",
    label: "today",
    usedYen: 1_200,
    recommendedYen: 9_999,
  },
  today: "2026-09-05",
  selected: false,
  disabled: false,
  ...overrides,
});

describe("buildCalendarDayPresentation", () => {
  it("describes today with its existing amount and non-duplicated state labels", () => {
    const result = buildCalendarDayPresentation(present());

    expect(result.amountLabel).toBe("1200 円");
    expect(result.stateLabels).toEqual(["今日", "入力済み"]);
    expect(result.accessibleLabel).toBe("2026-09-05、今日、1200 円、入力済み");
    expect(result.isSelected).toBe(false);
    expect(result.isDisabled).toBe(false);
  });

  it("preserves planned semantics for future rows", () => {
    const result = buildCalendarDayPresentation(
      present({
        row: {
          date: "2026-09-06",
          label: "planned",
          usedYen: 0,
          recommendedYen: 4_200,
        },
      }),
    );

    expect(result.temporalLabel).toBe("未来");
    expect(result.rowLabel).toBe("予定");
    expect(result.stateLabels).toEqual(["未来", "予定"]);
    expect(result.accessibleLabel).toBe("2026-09-06、未来、予定、0 円");
  });

  it("keeps planned and spent labels on a past row", () => {
    const result = buildCalendarDayPresentation(
      present({
        row: {
          date: "2026-09-04",
          label: "planned",
          usedYen: 500,
          recommendedYen: 100,
        },
      }),
    );

    expect(result.temporalLabel).toBe("過去");
    expect(result.rowLabel).toBe("予定");
    expect(result.stateLabels).toEqual(["過去", "予定", "入力済み"]);
    expect(result.amountLabel).toBe("500 円");
  });

  it("adds selection and disabled state without changing the amount", () => {
    const result = buildCalendarDayPresentation(
      present({ selected: true, disabled: true }),
    );

    expect(result.stateLabels).toEqual([
      "今日",
      "入力済み",
      "選択中",
      "操作不可",
    ]);
    expect(result.accessibleLabel).toBe(
      "2026-09-05、今日、1200 円、入力済み、選択中、操作不可",
    );
    expect(result.isSelected).toBe(true);
    expect(result.isDisabled).toBe(true);
  });
});
