import { Effect } from "effect";

export type D1DayEntryWriteMode = "add" | "overwrite";

export type D1DayEntryTotalWriteInput = {
  date: string;
  yearMonth: string;
  budgetPeriodId: string;
  totalUsedYen: number;
  nowIso: string;
};

export type D1DayEntryHistoryWriteInput = {
  id: string;
  date: string;
  budgetPeriodId: string;
  operationType: D1DayEntryWriteMode;
  inputYen: number;
  beforeTotalYen: number;
  afterTotalYen: number;
  memo: string | null;
  createdAt: string;
};

export type D1DayEntryReplayCommand =
  | {
      kind: "update";
      budgetPeriodId: string;
      date: string;
      yearMonth: string;
      nowIso: string;
      historyId: string;
      inputYen: number;
      memo: string | null;
    }
  | {
      kind: "delete";
      budgetPeriodId: string;
      date: string;
      yearMonth: string;
      nowIso: string;
      historyId: string;
    };

export interface D1DayEntryWriter {
  writeDailyEntry(input: {
    total: D1DayEntryTotalWriteInput;
    history: D1DayEntryHistoryWriteInput;
    mode: D1DayEntryWriteMode;
  }): Effect.Effect<void, Error>;
  writeHistoryReplay(
    input: D1DayEntryReplayCommand,
  ): Effect.Effect<void, Error>;
}
