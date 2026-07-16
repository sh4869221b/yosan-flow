# Database Layer Knowledge Base

## Overview

`src/lib/server/db/**` contains repository ports/implementations, the Drizzle D1 adapter and schema mirror, an in-memory transactional client, and the atomic raw-D1 day-entry writer.

## Map

- `budget-period-*`: period types, D1/in-memory repositories, row mapping, validation coordination.
- `daily-total-repository.ts`: daily-total ports and D1/in-memory implementations.
- `daily-history-*`: history ports, D1/in-memory implementations, mapping.
- `client.ts`: typed Drizzle adapter plus snapshot/queue-based in-memory transaction client.
- `day-entry-writer*.ts`: public Effect adapter and batch executor.
- `day-entry-{write,replay}-sql.ts`: raw statements and replay ordering.
- `schema.ts`: Drizzle mirror of `migrations/*.sql`.

## Repository Rules

- Scope every daily-total/history operation by `budget_period_id` and date; history item mutation also includes ID.
- Keep period overlap/continuity and out-of-range-entry validation coordinated with the write path. These checks are not fully enforced by D1 constraints and have concurrency sensitivity.
- Keep D1 and in-memory implementations behaviorally aligned, including error codes, ordering, and deletion semantics.
- Treat exported single-table D1 mutation methods as repository internals; normal day-entry commands must use the atomic writer rather than composing partial writes.

## Atomic Writer

- New entries batch history insert with total upsert.
- History edits/deletes batch mutation, chronological replay, empty-total delete, and final total upsert.
- Replay ordering is `created_at ASC, rowid ASC` so same-timestamp operations remain deterministic.
- Preserve repeated period/date/mode fields consistently across writer commands; the current types do not make inconsistent combinations impossible.
- Raw `.prepare` / `db.batch` access is allowed only in the writer family guarded by `tests/unit/non-migration-drizzle-guard.test.ts`.

## Schema Rules

- Change `migrations/*.sql` first and update `schema.ts` in the same task.
- Do not add runtime DDL or a second migration source of truth.
- Preserve the daily-total composite key and history period/date ordering indexes unless the migration explicitly changes the domain model.

## Verification

- Repository mapping/validation: `pnpm test:unit`.
- SQL shape, batch rollback, replay, same-timestamp order, period scoping: `pnpm test:integration`.
- Schema changes: `pnpm run cf:migrate:local`, `pnpm test:integration`, and `pnpm check`.
