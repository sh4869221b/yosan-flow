export type DailyRecommendation = {
  date: string;
  recommendedYen: number;
};

export type BuildDailyRecommendationsInput = {
  remainingYen: number;
  dates: string[];
};

export function buildDailyRecommendations(
  input: BuildDailyRecommendationsInput,
): DailyRecommendation[] {
  if (input.dates.length === 0) {
    return [];
  }

  if (input.remainingYen <= 0) {
    return input.dates.map((date) => ({
      date,
      recommendedYen: 0,
    }));
  }

  const base = Math.floor(input.remainingYen / input.dates.length);
  const remainder = input.remainingYen % input.dates.length;

  return input.dates.map((date, index) => ({
    date,
    recommendedYen: base + (index < remainder ? 1 : 0),
  }));
}
