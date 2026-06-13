export type BudgetPeriodRow = {
  id: string;
  start_date: string;
  end_date: string;
  budget_yen: number;
  status: "active" | "closed";
  predecessor_period_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyTotalRow = {
  budget_period_id: string;
  date: string;
  year_month: string;
  total_used_yen: number;
  updated_at: string;
};

export type DailyOperationHistoryRow = {
  rowid: number;
  id: string;
  budget_period_id: string;
  date: string;
  operation_type: "add" | "overwrite";
  input_yen: number;
  before_total_yen: number;
  after_total_yen: number;
  memo: string | null;
  created_at: string;
};
