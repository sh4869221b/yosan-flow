# Client yen input parsing follow-up

## Goal

GitHub issue #108 に対応し、dashboard client の円入力を server validation と同じ「0 以上の整数」に揃える。

## Scope

- `src/lib/dashboard/page-controller.svelte.ts`
- `src/lib/components/BudgetSummary.svelte`
- `src/lib/components/dashboard/CreatePeriodPanel.svelte`
- `src/lib/components/budget/BudgetPeriodForm.svelte`
- `src/lib/components/day-entry/DayEntryForm.svelte`
- `src/lib/components/HistoryPanel.svelte`
- `src/lib/components/day-entry/HistoryRow.svelte`
- `tests/unit/client-yen-input.test.ts`
- `tests/e2e/dashboard.spec.ts`
- `tests/e2e/dashboard-day-entry.spec.ts`

## Expected behavior

- Accept full non-negative integer strings such as `0`, `120000`, and surrounding whitespace around an integer.
- Reject blank, decimal, exponent, signed, and partially numeric strings such as `""`, `10.5`, `1e3`, `-1`, `+1`, and `1000abc`.
- Keep server API contracts unchanged.
- Preserve existing Japanese validation copy style.

## Verification

- RED/GREEN: `pnpm test:unit -- tests/unit/client-yen-input.test.ts`
- RED/GREEN: focused Playwright specs for invalid budget, day-entry, and history-edit input.
- Quality gate: `pnpm check`, focused E2E, and browser manual QA artifacts under `.omo/ulw-loop/evidence/`.
