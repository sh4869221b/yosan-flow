CREATE TABLE `day_entry_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `daily_operation_histories` ADD `write_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Preserve the stored chain for days that were already replayed by the old
-- timestamp rule. For other days use the original order of committed inserts.
-- Negative ranks come before all later inserts, including inserts from old
-- Workers during rollout. Their default 0 is read using the current rowid.
WITH ranked AS (
  SELECT rowid AS history_rowid, budget_period_id, date, before_total_yen,
    count(*) OVER (PARTITION BY budget_period_id, date) AS day_count,
    row_number() OVER insertion_order AS insertion_rank,
    row_number() OVER timestamp_order AS timestamp_rank,
    lag(after_total_yen, 1, 0) OVER insertion_order AS insertion_before,
    lag(after_total_yen, 1, 0) OVER timestamp_order AS timestamp_before
  FROM daily_operation_histories
  WINDOW
    insertion_order AS (PARTITION BY budget_period_id, date ORDER BY rowid),
    timestamp_order AS (PARTITION BY budget_period_id, date ORDER BY created_at, rowid)
), ordered AS (
  SELECT history_rowid, insertion_rank, timestamp_rank, day_count,
    min(before_total_yen = insertion_before) OVER day AS insertion_matches,
    min(before_total_yen = timestamp_before) OVER day AS timestamp_matches
  FROM ranked
  WINDOW day AS (PARTITION BY budget_period_id, date)
)
UPDATE daily_operation_histories
SET write_order = (CASE
  WHEN NOT ordered.insertion_matches AND ordered.timestamp_matches THEN ordered.timestamp_rank
  ELSE ordered.insertion_rank
END) - ordered.day_count - 1
FROM ordered
WHERE daily_operation_histories.rowid = CAST(ordered.history_rowid AS INTEGER);
