import type { FoodPaceSummary } from "./food-pace";

export function createFoodPaceRecommender({
  foodPace,
  remainingAtTodayYen,
  daysRemaining,
}: {
  foodPace: FoodPaceSummary;
  remainingAtTodayYen: number;
  daysRemaining: number;
}): (dayOffset: number) => number {
  if (daysRemaining === 0) return () => 0;

  const { baseDailyYen, todayAllowanceYen, todayBonusYen } = foodPace;
  if (todayBonusYen > 0) {
    return (dayOffset) => (dayOffset === 0 ? todayAllowanceYen : baseDailyYen);
  }

  const paceDeltaYen = remainingAtTodayYen - baseDailyYen * daysRemaining;
  const absoluteDeltaYen = Math.abs(paceDeltaYen);
  const dailyDeltaYen = Math.floor(absoluteDeltaYen / daysRemaining);
  const remainderYen = absoluteDeltaYen % daysRemaining;
  if (paceDeltaYen > 0) {
    return (dayOffset) =>
      baseDailyYen + (dailyDeltaYen + (dayOffset < remainderYen ? 1 : 0));
  }

  return (dayOffset) =>
    Math.max(
      0,
      baseDailyYen - (dailyDeltaYen + (dayOffset < remainderYen ? 1 : 0)),
    );
}
