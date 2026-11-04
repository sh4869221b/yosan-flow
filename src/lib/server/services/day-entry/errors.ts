export class PeriodNotFoundError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "PERIOD_NOT_FOUND";

  constructor(periodId: string) {
    super(`Period not found: ${periodId}`);
    this.name = "PeriodNotFoundError";
  }
}

export class DateOutOfPeriodError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "DATE_OUT_OF_PERIOD";

  constructor(date: string, periodId: string) {
    super(`Date ${date} is outside period ${periodId}`);
    this.name = "DateOutOfPeriodError";
  }
}

export class HistoryNotFoundError extends Error {
  // fallow-ignore-next-line unused-class-member -- Read dynamically by effect/result.ts for the stable API error contract.
  readonly code = "HISTORY_NOT_FOUND";

  constructor(historyId: string) {
    super(`History not found: ${historyId}`);
    this.name = "HistoryNotFoundError";
  }
}
