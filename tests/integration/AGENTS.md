# Integration Test Knowledge Base

## Overview

`tests/integration/**` verifies services, route factories, default SvelteKit handlers, repositories, and generated SQL contracts without starting a real server or remote D1.

## Test Modes

- Service/repository mode: `api/day-entry-fixture.ts` composes in-memory DB client, repositories, and `DayEntryService`.
- Injected-handler mode: `api/periods-fixture.ts` connects fresh in-memory services to `_create*Handler` factories and sends real `Request` objects.
- Default-route mode: public SvelteKit handlers receive `platform.env.DB` backed by the period-aware D1 fake.
- Choose the mode matching the boundary under change; preserve coverage of both handler factories and public method exports.

## D1 Fake

- Entry point is `helpers/period-d1-fake.ts`; implementation lives in `helpers/period-d1-fake-modules/`.
- The fake recognizes Drizzle/raw SQL fragments, bind argument positions, and raw column order. Repository/query changes must update the fake and its focused tests together.
- State keys include period ownership; history order is `created_at` then synthetic `rowid`.
- `batch()` snapshots state and restores it on failure to model atomic rollback.
- Unknown SQL shapes should fail explicitly or gain a deliberate dispatcher branch; do not silently return an empty success.

## Fixture Rules

- Create fresh fixtures/fakes per test; avoid shared mutable service state.
- Inject clocks and history IDs for deterministic replay and duplicate-ID rollback assertions.
- Use `runApiEffect` for service preparation and assert real HTTP status/JSON at handler boundaries.
- Existing `months-*.test.ts` names are historical; new tests and assertions remain period-first.

## Invariants

- Preserve `(budget_period_id, date)` scoping, same-timestamp insertion order, last-history total deletion, and batch rollback.
- The fake is not real D1. Migration/runtime behavior still needs `cf:migrate:local` or E2E when the SQL/schema surface changes.

## Verification

- Run `pnpm test:integration`; add `pnpm test:unit` for shared domain/architecture changes and `pnpm run cf:migrate:local` for schema work.
