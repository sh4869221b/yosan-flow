-- The deployed legacy writer replays all rows then present in timestamp/rowid
-- order. Later writes append in rowid order. A cutoff through the inserted
-- rows identifies exactly that replayed prefix. Only timestamp inversions
-- introduce distinct orders when extending the prefix.
CREATE TABLE __day_entry_cutover_plan AS
-- BEGIN LEGACY ORDER PLAN
WITH ledger AS (
  SELECT rowid AS history_rowid, budget_period_id, date, created_at, operation_type,
    input_yen, before_total_yen, after_total_yen, write_order,
    row_number() OVER inserted AS insertion_rank,
    max(created_at) OVER (
      PARTITION BY budget_period_id, date ORDER BY rowid
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS earlier_max_timestamp
  FROM daily_operation_histories
  WINDOW inserted AS (PARTITION BY budget_period_id, date ORDER BY rowid)
), days AS (
  SELECT budget_period_id, date, count(*) AS size,
    max(created_at < earlier_max_timestamp) AS has_inversions,
    max(write_order > 0) AS interim_writes
  FROM ledger
  GROUP BY budget_period_id, date
), eligible_days AS (
  SELECT * FROM days
  WHERE interim_writes = 0 AND (size <= 512 OR has_inversions IS NOT 1)
), distinct_cutoffs AS (
  SELECT budget_period_id, date, 0 AS cutoff FROM eligible_days
  UNION ALL
  SELECT l.budget_period_id, l.date, l.insertion_rank
  FROM ledger l JOIN eligible_days d USING (budget_period_id, date)
  WHERE l.created_at < l.earlier_max_timestamp
), ranked AS (
  SELECT l.*, c.cutoff, d.size,
    row_number() OVER candidate AS position,
    lag(l.after_total_yen, 1, 0) OVER candidate AS expected_before
  FROM distinct_cutoffs c
  JOIN eligible_days d USING (budget_period_id, date)
  JOIN ledger l USING (budget_period_id, date)
  WINDOW candidate AS (
    PARTITION BY l.budget_period_id, l.date, c.cutoff
    ORDER BY l.insertion_rank > c.cutoff,
      CASE WHEN l.insertion_rank <= c.cutoff THEN l.created_at END, l.history_rowid
  )
), valid_cutoffs AS (
  SELECT r.budget_period_id, r.date, r.cutoff
  FROM ranked r LEFT JOIN daily_totals t USING (budget_period_id, date)
  GROUP BY r.budget_period_id, r.date, r.cutoff
  HAVING min(CASE WHEN r.before_total_yen = r.expected_before
      AND r.after_total_yen = CASE r.operation_type
        WHEN 'add' THEN r.before_total_yen + r.input_yen
        WHEN 'overwrite' THEN r.input_yen
      END
      AND (r.position < r.size OR r.after_total_yen = t.total_used_yen)
    THEN 1 ELSE 0 END) = 1
), matches AS (
  SELECT budget_period_id, date, count(*) AS match_count, min(cutoff) AS cutoff
  FROM valid_cutoffs
  GROUP BY budget_period_id, date
)
SELECT r.budget_period_id, r.date, r.history_rowid,
  r.position - r.size - 1 AS verified_order, NULL AS issue
FROM ranked r JOIN matches m USING (budget_period_id, date, cutoff)
WHERE m.match_count = 1
UNION ALL
SELECT d.budget_period_id, d.date, NULL, NULL,
  CASE WHEN d.interim_writes = 1 THEN 'interim_writer'
       WHEN d.size > 512 AND d.has_inversions = 1 THEN 'review_limit'
       WHEN m.match_count > 1 THEN 'ambiguous_order'
       ELSE 'inconsistent_ledger'
  END
FROM days d LEFT JOIN matches m USING (budget_period_id, date)
WHERE m.match_count IS NOT 1
UNION ALL
SELECT t.budget_period_id, t.date, NULL, NULL, 'total_without_history'
FROM daily_totals t LEFT JOIN days d USING (budget_period_id, date)
WHERE d.date IS NULL
UNION ALL
SELECT NULL, NULL, NULL, NULL, 'interim_receipts'
WHERE EXISTS (SELECT 1 FROM day_entry_receipts)
-- END LEGACY ORDER PLAN
;
--> statement-breakpoint
CREATE TABLE __day_entry_cutover_assertion (
  unresolved_days integer NOT NULL
    CONSTRAINT LEGACY_HISTORY_ORDER_UNRESOLVED CHECK (unresolved_days = 0)
);
--> statement-breakpoint
INSERT INTO __day_entry_cutover_assertion
SELECT count(*) FROM __day_entry_cutover_plan WHERE issue IS NOT NULL;
--> statement-breakpoint
UPDATE daily_operation_histories
SET write_order = p.verified_order
FROM __day_entry_cutover_plan p
WHERE daily_operation_histories.rowid = CAST(p.history_rowid AS INTEGER);
--> statement-breakpoint
DROP TABLE __day_entry_cutover_plan;
--> statement-breakpoint
DROP TABLE __day_entry_cutover_assertion;
--> statement-breakpoint
ALTER TABLE `daily_operation_histories` RENAME TO `daily_operation_histories_v2`;
--> statement-breakpoint
ALTER TABLE `day_entry_receipts` RENAME TO `day_entry_receipts_v2`;
--> statement-breakpoint
CREATE TABLE `day_entry_cutover` (
	`id` integer PRIMARY KEY NOT NULL,
	`epoch` text NOT NULL,
	CONSTRAINT "day_entry_cutover_singleton" CHECK("day_entry_cutover"."id" = 1)
);
--> statement-breakpoint
INSERT INTO day_entry_cutover (id, epoch) VALUES (1, lower(hex(randomblob(16))));
