# Components Agent Notes

## Scope

Applies to `src/lib/components/**`.

## Component Map

- Top-level files such as `BudgetSummary.svelte`, `DayEntryModal.svelte`, `HistoryPanel.svelte`, `PeriodCalendar.svelte`, and `PeriodRangePicker.svelte` are shared dashboard surfaces.
- `budget/` contains budget period form, stats, and pace panels.
- `calendar/` contains calendar month UI and pure calendar-grid utilities.
- `dashboard/` contains high-level workspace/settings/create-period panels.
- `day-entry/` contains modal form, preview, and history row pieces.

## UI Rules

- Keep the main workflow centered on current-period budget, today's allowance, today's usage, and today's remaining amount.
- Avoid adding category-analysis or month-first concepts unless a task explicitly asks for them.
- Use Svelte 5 patterns already present in nearby components.
- Preserve existing Japanese product wording style and existing `data-testid` hooks used by Playwright.
- Prefer passing typed data from the controller over doing API work inside components.
- Keep fixed-format dashboard elements stable across responsive widths; avoid layout shifts from loading/error labels.

## Day Entry and History

- Editing or deleting history rows must keep the modal history list, summary totals, and selected row state coherent.
- Deleting the last history row should leave no visual stale total for that day after refresh.
- Validate form inputs in a way that matches server rules; do not rely on browser coercion for yen values.

## Verification

- Component utility changes can use focused unit tests, such as `tests/unit/calendar-grid.test.ts`.
- Browser workflow changes should update Playwright tests and preserve selectors used by existing specs.
