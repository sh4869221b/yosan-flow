# Service Layer Knowledge Base

## Overview

`src/lib/server/services/**` is the period-first application layer between routes and repositories/domain functions.

## Map

- `month-summary-service.ts`: legacy-named route-facing facade; its exports and behavior are period-first.
- `period-summary/`: pure-ish summary assembly, date ranges, food pace, recommendations.
- `day-entry-service.ts`, `day-entry/`: generic/in-memory command preparation, persistence, replay, result shaping.
- `api-services/`: common route port, D1/in-memory composition, platform cache, D1 command adapter.
- `history-id.ts`: injectable history ID generation.

## Composition Rules

- Routes should import the facade instead of reconstructing service composition.
- `InMemoryApiServices` is the shared route port despite its legacy name; both D1 and in-memory implementations must preserve its semantics.
- D1 mutations use the atomic `D1DayEntryWriter`. In-memory mutations use `DayEntryService` plus a serialized promise queue. Preserve this intentional implementation difference and test parity.
- `getApiServicesFromPlatform` caches D1 services per binding with a `WeakMap`; absent platform/forced dev uses the shared in-memory instance.
- Keep clock and history-ID factories injectable for deterministic tests.

## Domain Workflows

- Period summary excludes out-of-period totals and distinguishes spending before today from spending today.
- Today usage does not feed back into today's allowance/bonus; future and expired periods have no active pace dates.
- Add/overwrite prepares input, validates period ownership, persists total/history together, then returns a refreshed result.
- History edit/delete replays operations chronologically; zero remaining histories removes the daily total.
- Preserve stable error codes and D1/in-memory response parity when changing either workflow.

## Verification

- Summary math/date/pace: focused `tests/unit/month-summary-*.test.ts` suites.
- Generic day-entry/replay: unit plus `tests/integration/api/days-history-replay.test.ts`.
- D1/in-memory composition or parity: integration routes using both injected services and the period-aware D1 fake.
- Platform service selection: focused integration coverage and `pnpm check`.
