# Server Knowledge Base

## Overview

`src/lib/server/**` owns period domain rules, Effect services, API validation/error mapping, persistence contracts, and JST date semantics.

## Shape

- `db/`: repositories, Drizzle mirror, in-memory transaction client, raw-D1 writer.
- `services/`: route-facing facade, API-service composition, day-entry commands, period summary.
- `domain/`: pure budget-period and daily-entry assertions.
- `validation/`: request parsing and stable API error conversion.
- `effect/`: error normalization and Effect-to-Promise boundary.
- `time/`: JST date formatting/comparison.

## Domain Invariants

- Period records use `start_date` / `end_date` and may span months.
- Daily totals and histories are owned by `budget_period_id`; never query or mutate by date alone.
- Same-day spending changes today's used/remaining values without recalculating today's bonus/adjustment.
- Future periods expose no today allowance before their start date.
- Replay histories oldest-to-newest within `(budget_period_id, date)`; deleting the last history removes its daily total.

## Effect and Error Boundary

- Service methods return `Effect` values; route/page code executes them with `runApiEffect`.
- Convert synchronous failures with `toEffectError` and API failures with `toApiErrorResponse`.
- Keep domain errors near the owning service/repository. Add a new error type only when callers require a stable code or distinct response.
- Validation is a system boundary concern; keep already-validated domain logic free of duplicate parsing.

## Persistence Boundary

- `migrations/*.sql` is authoritative; `db/schema.ts` is a manually synchronized mirror.
- Request-time schema creation and generated Drizzle migration ownership are not adopted.
- Normal queries remain behind repositories/Drizzle. Raw D1 access is restricted by architecture tests to the day-entry writer family.

## Verification

- Domain/repository/service logic: focused `pnpm test:unit`.
- Route/service/D1 behavior: `pnpm test:integration`.
- Schema changes: update SQL and mirror, then run `pnpm run cf:migrate:local`, integration tests, and `pnpm check`.
- Server/API coverage is available through `pnpm test:coverage` but is not a required CI gate.
