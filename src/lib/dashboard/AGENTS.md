# Dashboard Controller Agent Notes

## Scope

Applies to `src/lib/dashboard/**`.

## Responsibilities

- `api-urls.ts` builds period-first dashboard API URLs.
- `fetch-json.ts` wraps client JSON fetch behavior and API error fallback mapping.
- `client-effect.ts` owns fire-and-forget client Effect execution.
- `date.ts` owns client-side period/date helpers.
- `types.ts` owns dashboard request/response DTOs.
- `page-controller.svelte.ts` is the public facade; period, day-entry, history, and preview responsibilities live in focused controller modules nearby.

## Controller Rules

- Keep `+page.svelte` thin; put dashboard state transitions and API side effects here.
- Instantiate the controller from a function that reads page data so Svelte does not capture stale initial values.
- Keep the selected period, range inputs, modal row, histories, and summary refreshes in sync after any period/day/history mutation.
- Treat empty string numeric inputs explicitly. Avoid `Number("")` behavior and avoid `parseInt` truncation when a full integer validation is required.
- Prefer existing `Effect` client helpers for async flows, loading flags, and error states.
- User-facing messages are currently Japanese; keep new dashboard validation/error text in Japanese unless nearby text is English.

## Domain Coupling

- Build URLs through the period-first helpers in `api-urls.ts`.
- Do not infer month-first state from dates. The selected `periodId` is the key for summary and day-entry operations.
- Same-day spending should update today's visible used/remaining amounts, not recalculate today's bonus/adjustment.

## Verification

- Controller changes usually need `pnpm check`.
- Browser-visible period/day/history changes should add or update Playwright coverage under `tests/e2e`.
