const jstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatJstDate(date: Date): string {
  const parts = jstDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format JST date");
  }

  return `${year}-${month}-${day}`;
}

export function getJstDateParts(now: Date) {
  const date = formatJstDate(now);
  return {
    date,
    yearMonth: date.slice(0, 7),
  };
}

export function isFutureDateFromJstToday(
  targetDate: string,
  jstToday: string,
): boolean {
  return targetDate > jstToday;
}
