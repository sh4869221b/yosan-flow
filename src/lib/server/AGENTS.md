# Server Agent Notes

## Scope

Applies to `src/lib/server/**`.

## Shape

- `db/` contains D1/Drizzle-facing repositories, database client adapters, schema mirror, and the D1 day-entry writer.
- `domain/` contains pure budget-period and daily-entry rules.
- `services/` coordinates repositories and domain behavior. `month-summary-service.ts` is still the main summary/service boundary even though the app is period-first.
- `services/api-services/` selects D1-backed, in-memory, and cached service implementations.
- `validation/` owns request parsing and API error conversion. Keep route handlers thin.
- `time/jst.ts` owns JST date helpers used by summaries and tests.

## Domain Invariants

- Period-owned records must be scoped by `budget_period_id`; do not mutate day totals or operation histories by date alone.
- Budget periods use `start_date` and `end_date`, and may cross month boundaries.
- Old month/day update behavior is not a compatibility surface unless a task explicitly asks for it.
- Same-day spending affects today's used/remaining amount only. It must not recalculate today's bonus or adjustment.
- Future period summaries must not expose today's food allowance before the period starts.

## D1 and Repository Rules

- SQL migrations in `migrations/*.sql` are the schema source of truth. `db/schema.ts` is a Drizzle mirror, not a migration generator.
- Request-time schema bootstrap is out of scope. Apply migrations before D1-backed execution.
- Keep normal application queries behind repositories or the existing Drizzle boundary.
- `db/day-entry-writer.ts` intentionally writes the atomic daily total/history mutation and replay SQL. Preserve transaction-like batching and `(budget_period_id, date, id)` filters.
- When deleting the last history row for a day, remove the corresponding daily total instead of leaving a zero-value tombstone.
- Replay history rows oldest-to-newest for the same `(budget_period_id, date)` and recompute before/after totals consistently.

## Effect and Errors

- Service methods return `Effect` values and route/page boundaries use `runApiEffect`.
- Convert thrown validation/repository failures through existing helpers such as `toEffectError` and `toApiErrorResponse`.
- Add new error classes only when callers need stable codes or distinct API behavior.

## Verification

- Repository/domain changes usually need `pnpm test:unit`.
- Route/service/DB behavior changes usually need `pnpm test:integration`.
- D1 schema changes also need `pnpm run cf:migrate:local`.
