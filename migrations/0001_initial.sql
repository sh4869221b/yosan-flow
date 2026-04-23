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

CREATE TRIGGER budget_periods_no_overlap_insert
BEFORE INSERT ON budget_periods
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE start_date <= NEW.end_date
         AND end_date >= NEW.start_date
    ) THEN RAISE(ABORT, 'PERIOD_OVERLAP')
  END;
END;

CREATE TRIGGER budget_periods_no_overlap_update
BEFORE UPDATE ON budget_periods
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id <> NEW.id
         AND start_date <= NEW.end_date
         AND end_date >= NEW.start_date
    ) THEN RAISE(ABORT, 'PERIOD_OVERLAP')
  END;
END;

CREATE TRIGGER budget_periods_predecessor_insert
BEFORE INSERT ON budget_periods
FOR EACH ROW
WHEN NEW.predecessor_period_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id = NEW.predecessor_period_id
         AND date(end_date, '+1 day') = NEW.start_date
    ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
  END;
END;

CREATE TRIGGER budget_periods_predecessor_update
BEFORE UPDATE ON budget_periods
FOR EACH ROW
WHEN NEW.predecessor_period_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id = NEW.predecessor_period_id
         AND date(end_date, '+1 day') = NEW.start_date
    ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
  END;
END;

CREATE TRIGGER budget_periods_successor_update
BEFORE UPDATE ON budget_periods
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE predecessor_period_id = NEW.id
         AND start_date <> date(NEW.end_date, '+1 day')
    ) THEN RAISE(ABORT, 'PERIOD_CONTINUITY_VIOLATION')
  END;
END;

CREATE TRIGGER budget_periods_update_range_guard
BEFORE UPDATE ON budget_periods
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM daily_totals
       WHERE budget_period_id = NEW.id
         AND (date < NEW.start_date OR date > NEW.end_date)
    ) THEN RAISE(ABORT, 'PERIOD_HAS_OUT_OF_RANGE_ENTRIES')
  END;
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM daily_operation_histories
       WHERE budget_period_id = NEW.id
         AND (date < NEW.start_date OR date > NEW.end_date)
    ) THEN RAISE(ABORT, 'PERIOD_HAS_OUT_OF_RANGE_ENTRIES')
  END;
END;

CREATE TRIGGER daily_totals_date_in_period_insert
BEFORE INSERT ON daily_totals
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id = NEW.budget_period_id
         AND NEW.date >= start_date
         AND NEW.date <= end_date
    ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
  END;
END;

CREATE TRIGGER daily_totals_date_in_period_update
BEFORE UPDATE ON daily_totals
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id = NEW.budget_period_id
         AND NEW.date >= start_date
         AND NEW.date <= end_date
    ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
  END;
END;

CREATE TRIGGER daily_histories_date_in_period_insert
BEFORE INSERT ON daily_operation_histories
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM budget_periods
       WHERE id = NEW.budget_period_id
         AND NEW.date >= start_date
         AND NEW.date <= end_date
    ) THEN RAISE(ABORT, 'DATE_OUT_OF_PERIOD')
  END;
END;
