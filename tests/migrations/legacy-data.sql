-- Artificial data only. Sparse rowids and IDs in reverse lexical order make
-- accidental table-copy ordering changes observable. NULL text PKs are legal
-- in the immutable legacy SQLite DDL, even though Drizzle models non-null IDs.
INSERT INTO budget_periods (rowid, id, start_date, end_date, budget_yen, status, predecessor_period_id, created_at, updated_at) VALUES
  (8, 'period-old', '2026-09-01', '2026-09-30', 30000, 'closed', NULL, 'created-old', 'updated-old'),
  (20, 'period-current', '2026-10-01', '2026-10-31', 45000, 'active', 'period-old', 'created-current', 'updated-current'),
  (37, NULL, '2026-11-01', '2026-11-30', 0, 'active', NULL, 'legacy-null', 'legacy-null');
INSERT INTO daily_totals (rowid, budget_period_id, date, year_month, total_used_yen, updated_at) VALUES
  (4, 'period-old', '2026-09-30', '2026-09', 350, 'total-old'),
  (29, 'period-current', '2026-09-30', '2026-09', 125, 'total-current');
INSERT INTO daily_operation_histories (rowid, id, budget_period_id, date, operation_type, input_yen, before_total_yen, after_total_yen, memo, created_at) VALUES
  (9, 'history-z', 'period-current', '2026-09-30', 'add', 50, 0, 50, '保持するメモ ''引用''', 'same-time'),
  (31, 'history-a', 'period-current', '2026-09-30', 'overwrite', 125, 50, 125, NULL, 'same-time'),
  (50, NULL, 'period-current', '2026-09-30', 'add', 0, 125, 125, '', 'same-time'),
  (6, 'history-other-period', 'period-old', '2026-09-30', 'add', 350, 0, 350, NULL, 'same-time');
