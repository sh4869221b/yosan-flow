export type PeriodListResponse<TPeriodOption> = {
  periods?: TPeriodOption[];
};

export type PeriodCreateResponse = {
  id: string;
};

export type HistoryItem = {
  id: string;
  date: string;
  operationType: "add" | "overwrite";
  inputYen: number;
  beforeTotalYen: number;
  afterTotalYen: number;
  memo: string | null;
  createdAt: string;
};

export type HistoryResponse = {
  histories?: HistoryItem[];
};

export type HistoryMutationResponse<TPeriodSummary> = {
  summary: TPeriodSummary;
  histories: HistoryItem[];
};

export type SavePeriodPayload = {
  budgetYen: number;
  startDate: string;
  endDate: string;
};

export type SubmitDayEntryPayload = {
  date: string;
  inputYen: number;
  memo: string;
};

export type UpdateHistoryPayload = {
  historyId: string;
  inputYen: number;
  memo: string;
};

export type DeleteHistoryPayload = {
  historyId: string;
};
