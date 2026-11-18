export function filterEntriesOutsideRange<
  Row extends { budget_period_id: string; date: string },
>(rows: Row[], args: unknown[]): Row[] {
  const [beforePeriodId, startDate, afterPeriodId, endDate] = args.map(String);
  return rows.filter(
    (row) =>
      (row.budget_period_id === beforePeriodId && row.date < startDate) ||
      (row.budget_period_id === afterPeriodId && row.date > endDate),
  );
}
