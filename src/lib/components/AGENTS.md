# Components Knowledge Base

## Overview

`src/lib/components/**` renders the period-first dashboard from typed controller data; components do not own API orchestration.

## Component Map

- Top level: `BudgetSummary`, `PeriodCalendar`, `PeriodRangePicker`, `DayEntryModal`, `HistoryPanel`.
- `budget/`: period header/form, totals, food-pace panel.
- `calendar/`: month presentation and pure grid utilities.
- `dashboard/`: workspace, settings, empty/create-period panels.
- `day-entry/`: input form, preview, history row.

## UI Rules

- Keep the visual hierarchy centered on current-period budget, today's allowance, today's usage, and today's remaining amount.
- Avoid category-analysis and month-first UI concepts unless explicitly requested.
- Use nearby Svelte 5 patterns and pass typed controller data/actions; do not fetch inside components.
- Preserve Japanese product wording and existing `data-testid` hooks used by Playwright.
- Prefer accessible labels/roles for user controls; reserve test IDs for stable dynamic structure and values.
- Keep fixed-format summary elements stable across responsive widths; loading/error text must not create avoidable layout shifts.

## Day Entry and History

- History edit/delete must keep the modal list, selected row, visible daily total, and period summary coherent.
- Deleting the last history row must not leave a stale or zero tombstone total in the UI.
- Validate yen input consistently with server rules; browser coercion is not validation.
- Preserve modal session state against stale save/history responses from a previous period or date.

## Structure

- `tests/unit/budget-summary-structure.test.ts` protects the intentional component split and LOC limits. Extend the existing subcomponent boundaries instead of weakening the guard.
- Shared non-visual state belongs in `src/lib/dashboard/**`; pure calendar/range helpers may stay beside their components.

## Verification

- Pure utilities: focused unit tests such as `calendar-grid.test.ts` or yen/range tests.
- Component type/wiring changes: `pnpm check`.
- Visual or interaction changes: focused Playwright tests while preserving selectors.
