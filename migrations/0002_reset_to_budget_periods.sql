DROP TABLE IF EXISTS daily_operation_histories;
DROP TABLE IF EXISTS daily_totals;
DROP TABLE IF EXISTS budget_periods;
DROP TABLE IF EXISTS monthly_budgets;

CREATE TABLE budget_periods (
  id TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  budget_yen INTEGER NOT NULL CHECK (budget_yen >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  predecessor_period_id TEXT NULL REFERENCES budget_periods (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE INDEX idx_budget_periods_start_end
  ON budget_periods (start_date, end_date);

CREATE TABLE daily_totals (
  budget_period_id TEXT NOT NULL REFERENCES budget_periods (id),
  date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  total_used_yen INTEGER NOT NULL CHECK (total_used_yen >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (budget_period_id, date)
);

CREATE INDEX idx_daily_totals_period_date
  ON daily_totals (budget_period_id, date);

CREATE TABLE daily_operation_histories (
  id TEXT PRIMARY KEY,
  budget_period_id TEXT NOT NULL REFERENCES budget_periods (id),
  date TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('add', 'overwrite')),
  input_yen INTEGER NOT NULL CHECK (input_yen >= 0),
  before_total_yen INTEGER NOT NULL CHECK (before_total_yen >= 0),
  after_total_yen INTEGER NOT NULL CHECK (after_total_yen >= 0),
  memo TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_daily_histories_period_date_created_at
  ON daily_operation_histories (budget_period_id, date, created_at DESC);
