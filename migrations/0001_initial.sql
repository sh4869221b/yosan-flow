CREATE TABLE monthly_budgets (
  year_month TEXT PRIMARY KEY,
  budget_yen INTEGER NULL,
  budget_status TEXT NOT NULL CHECK (budget_status IN ('unset', 'set')),
  initialized_from_previous_month INTEGER NOT NULL DEFAULT 0,
  carried_from_year_month TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_totals (
  date TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  total_used_yen INTEGER NOT NULL CHECK (total_used_yen >= 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_daily_totals_year_month
  ON daily_totals (year_month, date);

CREATE TABLE daily_operation_histories (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'overwrite')),
  input_yen INTEGER NOT NULL CHECK (input_yen >= 0),
  before_total_yen INTEGER NOT NULL CHECK (before_total_yen >= 0),
  after_total_yen INTEGER NOT NULL CHECK (after_total_yen >= 0),
  memo TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_daily_histories_date_created_at
  ON daily_operation_histories (date, created_at DESC);
