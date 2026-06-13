export type FoodPaceStatus = "bonus" | "adjustment" | "on_track";

export type FoodPaceSummary = {
  status: FoodPaceStatus;
  baseDailyYen: number;
  todayAllowanceYen: number;
  usedTodayYen: number;
  todayRemainingYen: number;
  todayBonusYen: number;
  adjustmentYen: number;
  totalAdjustmentYen: number;
};

export function buildFoodPaceSummary(input: {
  budgetYen: number;
  periodLengthDays: number;
  spentBeforeTodayYen: number;
  usedTodayYen: number;
  remainingDates: string[];
}): FoodPaceSummary {
  const baseDailyYen =
    input.periodLengthDays === 0
      ? 0
      : Math.floor(input.budgetYen / input.periodLengthDays);
  const daysFromToday = input.remainingDates.length;
  if (daysFromToday === 0) {
    return {
      status: "on_track",
      baseDailyYen,
      todayAllowanceYen: 0,
      usedTodayYen: input.usedTodayYen,
      todayRemainingYen: input.usedTodayYen === 0 ? 0 : -input.usedTodayYen,
      todayBonusYen: 0,
      adjustmentYen: 0,
      totalAdjustmentYen: 0,
    };
  }

  const remainingAtTodayStartYen = input.budgetYen - input.spentBeforeTodayYen;
  const expectedRemainingAtBasePaceYen = baseDailyYen * daysFromToday;
  const paceDeltaYen =
    remainingAtTodayStartYen - expectedRemainingAtBasePaceYen;
  const todayBonusYen = paceDeltaYen > 0 ? paceDeltaYen : 0;
  const shortageYen = paceDeltaYen < 0 ? Math.abs(paceDeltaYen) : 0;
  const adjustmentBaseYen =
    shortageYen > 0 ? Math.floor(shortageYen / daysFromToday) : 0;
  const adjustmentRemainderYen = shortageYen % daysFromToday;
  const adjustmentYen =
    adjustmentBaseYen + (adjustmentRemainderYen > 0 ? 1 : 0);
  const todayAllowanceYen = Math.max(
    0,
    baseDailyYen + todayBonusYen - adjustmentYen,
  );

  return {
    status:
      todayBonusYen > 0
        ? "bonus"
        : adjustmentYen > 0
          ? "adjustment"
          : "on_track",
    baseDailyYen,
    todayAllowanceYen,
    usedTodayYen: input.usedTodayYen,
    todayRemainingYen: todayAllowanceYen - input.usedTodayYen,
    todayBonusYen,
    adjustmentYen,
    totalAdjustmentYen: shortageYen,
  };
}
