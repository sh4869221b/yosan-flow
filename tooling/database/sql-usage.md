# SQL ownership and review

The canonical schema is `src/lib/server/db/schema.ts`. Use Drizzle's typed table,
column, predicate and query builders for representable application operations.
Use bound `sql` expressions only for SQLite features the builder cannot represent.
Putting an entire ordinary query in a tagged SQL string is not a substitute for
using the builder.

## Runtime inventory

Paths below are under `src/lib/server/db/` unless stated otherwise.

| Owner                                    | SQL responsibility                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`                              | Three tables, indexes, keys and static CHECK expressions. Schema definition only; no request-time DDL.                                                   |
| `client.ts`, `d1-types.ts`               | Drizzle/D1 adapter and binding types. No application query strings.                                                                                      |
| `budget-period-d1-query.ts`              | Typed period, predecessor/successor, overlap and continuity reads.                                                                                       |
| `budget-period-write-d1.ts`              | Typed conditional INSERT/UPDATE with overlap, current linkage and displaced-entry predicates in the write; fresh-read classification of rejected writes. |
| `budget-period-d1-repository.ts`         | Typed period CRUD and orchestration of validation and the linked-boundary writer.                                                                        |
| `budget-period-boundary-d1.ts`           | One conditional two-period UPDATE through Drizzle, with JSON/date/CASE expressions and commit-time predicates.                                           |
| `daily-total-repository.ts`              | Typed scoped total reads, upsert and outside-range existence checks. In-memory implementation has no SQL.                                                |
| `daily-history-d1-repository.ts`         | Typed scoped history reads/inserts and ID existence checks; hidden SQLite `rowid` breaks timestamp ties.                                                 |
| `day-entry-write-sql.ts`                 | Typed history INSERT…SELECT and total UPSERT. Compiles builders with `toSQL()` and binds their parameters without executing them.                        |
| `day-entry-replay-sql.ts`                | Typed history update/delete, empty-total deletion and final-total upsert; one handwritten recursive replay statement.                                    |
| `day-entry-writer.ts`                    | Executes each complete entry/replay batch once. Raw D1 batch is the atomic execution boundary.                                                           |
| `src/routes/api/__test/reset/+server.ts` | Typed Drizzle counts and deletion in dependency order, behind the existing local/test token guard.                                                       |

Service composition, repository ports/mappers, in-memory repositories and route
handlers outside the guarded reset do not author SQL. Keep database access behind
these boundaries rather than adding a second execution path.

### Atomic writers and limits

- Entry writes are two statements: history first, then total. Both check the
  owning period and date at write time. Replay is four statements: mutate history,
  replay, remove an empty total, upsert the final persisted history total. Do not
  execute builders early or replace these batches with JavaScript read/write loops.
- Recursive replay is the deliberate SQL exception because the SQLite Drizzle
  builder does not provide a recursive-CTE API. It scopes by period/date and orders
  by `created_at ASC, rowid ASC`. Internal row identity is `rowid`, so preserved
  legacy NULL text IDs also participate correctly. External mutations still use
  the period/date/history-ID contract. Do not rebuild tables or rewrite legacy IDs.
- The linked-boundary writer uses one bound JSON command and an input CTE in the
  UPDATE's FROM clause. Repeated scalar `(SELECT payload FROM input)` expressions
  caused the D1 nested-subquery limit failure; using a CTE alone does not prevent
  repeated expansion. Require exactly two changed rows on success and zero on a
  conditional miss. An unexpected one-row count detects an invariant failure;
  throwing after execution would not undo an already committed partial write.
- D1 permits 100 bound parameters per statement. Captured entry counts are add
  `15 + 8`, overwrite `13 + 8`; replay update `5 + 4 + 4 + 7`, delete `3 + 4 + 4 + 7`.
  Ordinary period writes use 13 parameters for create, 15 with a predecessor,
  and 17 for update, verified against local D1.
  These are per-statement counts, not a batch-wide allowance. Keep generated-SQL
  parameter checks when changing builders.
- SQLite's default parser/subquery limits are not D1's limits. In particular,
  workerd's nested-subquery limit is 100; a default SQLite shell can accept a query
  D1 rejects. Exercise the actual pinned local Worker runtime as well as SQLite.
- Ordinary period create/update retain early validation for useful error messages,
  then recheck overlap and current predecessor/successor continuity inside their
  conditional INSERT/UPDATE. Updates also reject displaced totals/history, including
  entries added after preflight. A fixed one-row SELECT supports inserts into an
  empty database, and ON CONFLICT DO NOTHING preserves same-ID create idempotency.
  Zero-change guards re-read for existing error codes, falling back to
  `PERIOD_UPDATE_CONFLICT` if state changes again; they do not retry the mutation.
  This protects invariants, not full-row compare-and-swap: concurrent ordinary
  changes that both preserve invariants retain the existing last-write behavior.
  Ordinary and linked-boundary overlap guards also include legacy periods with NULL IDs.

### Injection and privacy

Bind IDs, dates, amounts, memos and command JSON. Use schema columns and aliases
for identifiers; the `excluded` reference uses `sql.identifier` with schema-owned
names. Static JSON paths may be escaped/inlined locally, but never inline the
command or user values. `sql.raw` is not used by application code.

Keep application logs/custom spans free of SQL, bound values, domain IDs, concrete
dates, amounts, memos and raw errors. Preserve the existing sanitized error/logging
boundary. Synthetic fixture captures do not authorize logging production SQL or
copying production data into tests. Cloudflare's standard telemetry attributes
remain subject to the separate privacy contract in the README.

## Migration and test SQL

SQL outside runtime persistence has distinct purposes. Do not mechanically replace
these files with ORM calls:

- `migrations/0001_initial.sql` and `0002_reset_to_budget_periods.sql` are immutable
  history. `0002` drops tables/data and must not be replayed on an existing database.
  `20261002021516_legacy_baseline.sql` is the read-only `SELECT 1` adoption baseline.
  Preserve the snapshot and append-only journal history. Generate future SQL and
  metadata with Drizzle Kit, then apply only with Wrangler.
- `tests/migrations/database.ts`, `history.ts`, `schema.ts` and `preservation.ts`
  own disposable migration application, history checks, schema inspection and
  row/value/rowid preservation. Introspection PRAGMAs, transaction statements,
  generated DDL and deliberate constraint violations are necessary test SQL.
  Dynamic table/column references come from fixed fixture/schema inventories;
  introspection names are quoted, and migration filenames are bound.
- `tests/migrations/legacy-data.sql`, `api.test.ts`, `history-replay.test.ts`,
  `safety.test.ts`, `schema-inspection.test.ts`, `history.test.ts` and
  `tests/unit/migration-baseline.test.ts` contain artificial fixtures, assertions
  and negative controls. Their destructive statements target fresh disposable
  databases, never normal local state or remote D1.
- `tests/migrations/sqlite-d1.ts` executes application SQL on real SQLite with
  bound parameters and rollback around batches. `wrangler.test.ts` separately
  checks Wrangler's migration ledger and data preservation on isolated local D1.
- `tests/integration/day-entry-write-sqlite.test.ts`,
  `day-entry-drizzle-batch.test.ts` and `api/period-boundary-generated-sql.test.ts`
  exercise generated SQL. The small fixture DDL is not the canonical schema;
  migration/API suites separately cover actual migrated tables and constraints.
  `api/period-boundary-workerd.test.ts` separately executes the boundary matrix
  against the repository-pinned local workerd with canonical migrations and
  ephemeral state; it does not access remote bindings.
- `tests/integration/ordinary-period-write-races.test.ts` uses migrated SQLite and
  real generated SQL, injecting committed changes after preflight and before DML.
  It covers overlapping creates, same-ID idempotency, changed/missing predecessors,
  newly linked successors and displaced totals/history.
- `tests/integration/helpers/period-d1-fake.ts` and `period-d1-fake-modules/**`
  recognize SQL shapes and bind positions. Their strings are dispatch contracts,
  not database queries. Associated helper/route tests validate those contracts.
  They must change deliberately with generated SQL, not silently ignore a shape.
- `tests/unit/non-migration-drizzle-guard.test.ts`, its helper and negative-control
  tests inspect source ownership, not a database. Other SQL-looking strings in
  observability tests are artificial error/privacy probes.
- `drizzle.config.ts`, `package.json`, `wrangler.jsonc`, `playwright.config.ts` and
  CI workflows configure generation/local migration/verification. `scripts/**`
  contains no application SQL; E2E helpers seed through public APIs. Worker type
  files are generated declarations, not executable SQL. SQL mentions in other
  tooling documents/baselines are historical diagnostics, not execution paths.

See [migration policy](../../CONTRIBUTING.md#migration-policy) for the complete
history, upgrade and approval requirements. No remote migration, deployment or
schema change is implied by a SQL refactor.

## Regression guards and evidence limits

The source guard parses TS/JS and both Svelte script contexts plus template
expressions. It resolves member ownership with TypeScript, distinguishing Drizzle
and RegExp methods from D1 even when receivers are renamed. Literal bracket,
optional and destructured D1 access is checked. Raw prepare/bind and batch
capabilities are restricted to the exact writer files; type aliases have their
own boundary. Runtime DDL, PRAGMA, migrator imports and Drizzle `sql.raw` are also
rejected inside those files. Comments and ordinary Drizzle calls remain valid.
Dynamic computed names and arbitrarily constructed SQL still require review;
this is an architecture regression guard, not a sandbox or injection proof.

The pattern fake is not a SQL engine: some unknown shapes and `all()`/`exec()`
currently return empty success, and linked-boundary evaluation shares the
in-memory predicate implementation. Its affected-row override does not mutate
one row, so that test checks error mapping, not rollback of a partial write.
Real SQLite trigger/constraint failure tests and actual local D1 execution are
required evidence for atomicity and runtime compatibility.

Run the repository-pinned toolchain and normal required gates, including
`pnpm db:verify`, unit/integration checks, build and E2E. The migration gate checks
empty and legacy-seeded disposable databases, but no finite fixture suite proves
safety for every existing database or unlimited history size. Keep inspection of
new SQL, large histories/query limits and dependency/runtime changes in review.
