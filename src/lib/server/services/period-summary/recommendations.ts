import type { FoodPaceSummary } from "./food-pace";

export function buildFoodPaceRecommendations(input: {
  foodPace: FoodPaceSummary;
  remainingAtTodayYen: number;
  remainingDates: string[];
}): Array<{ date: string; recommendedYen: number }> {
  const expectedRemainingAtBasePaceYen =
    input.foodPace.baseDailyYen * input.remainingDates.length;
  const surplusYen = Math.max(
    0,
    input.remainingAtTodayYen - expectedRemainingAtBasePaceYen,
  );
  const shortageYen = Math.max(
    0,
    expectedRemainingAtBasePaceYen - input.remainingAtTodayYen,
  );
  const surplusBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(surplusYen / input.remainingDates.length);
  const surplusRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : surplusYen % input.remainingDates.length;
  const adjustmentBaseYen =
    input.remainingDates.length === 0
      ? 0
      : Math.floor(shortageYen / input.remainingDates.length);
  const adjustmentRemainderYen =
    input.remainingDates.length === 0
      ? 0
      : shortageYen % input.remainingDates.length;

  return input.remainingDates.map((date, index) => {
    if (input.foodPace.todayBonusYen > 0) {
      return {
        date,
        recommendedYen:
          index === 0
            ? input.foodPace.todayAllowanceYen
            : input.foodPace.baseDailyYen,
      };
    }

    if (surplusYen > 0) {
      const extraYen = surplusBaseYen + (index < surplusRemainderYen ? 1 : 0);
      return {
        date,
        recommendedYen: input.foodPace.baseDailyYen + extraYen,
      };
    }

    const adjustmentYen =
      adjustmentBaseYen + (index < adjustmentRemainderYen ? 1 : 0);
    return {
      date,
      recommendedYen: Math.max(0, input.foodPace.baseDailyYen - adjustmentYen),
    };
  });
}
