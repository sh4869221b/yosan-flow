# Yosan Flow Full-Stack Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Use TDD: characterization test first, verify red when behavior is not yet extracted, implement minimal refactor, verify green.

**Goal:** Refactor the SvelteKit + Cloudflare Workers + D1 app into smaller UI, client-state, service, calculation, validation, and persistence modules without changing external route behavior.

**Architecture:** Keep public SvelteKit routes and API response shapes stable. Extract pure calculation and validation first, then move orchestration/composition behind façade exports so existing imports can migrate safely. UI refactors should preserve current visual language and Playwright selectors.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Effect, Drizzle ORM, Cloudflare D1, Vitest, Playwright, Bits UI.

---

## Context

**User Request Summary:** Create an ultrawork-ready, parallelizable refactoring plan for `+page.svelte`, `month-summary-service.ts`, `day-entry-service.ts`, `budget-period-repository.ts`, `day-entry-writer.ts`, and large Svelte UI components, preserving all public behavior and quality gates.

**Current Findings:**

- `src/routes/+page.svelte` mixes Svelte state, API calls, modal flow, period creation/update, and page layout/styles.
- `src/lib/server/services/month-summary-service.ts` combines pure summary calculation, in-memory service wiring, D1 wiring, global cache, D1 day-entry adapter, and API-service façade exports.
- `src/lib/server/services/day-entry-service.ts` already has replay logic and persistence mixed in one class.
- `src/lib/server/db/day-entry-writer.ts` is the allowed raw D1 atomic writer exception under `tests/unit/non-migration-drizzle-guard.test.ts`.
- Recent history edit/delete behavior is already implemented and tested; this plan must protect it, not reimplement it.
- Relevant spec: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md`.
- Recent commits use semantic style: `feat: ...`, `fix: ...`, `test: ...`, `refactor: ...`.

**Decisions:**

- `.svelte.ts` rune modules are approved for dashboard state extraction (Task 10).
- Plan will be saved to `docs/superpowers/plans/2026-05-31-full-stack-refactor.md`.
- Execution will proceed wave-by-wave, starting with Wave 1.

## File Map

**Create:**

- `src/lib/server/services/period-summary/types.ts`
- `src/lib/server/services/period-summary/date-range.ts`
- `src/lib/server/services/period-summary/food-pace.ts`
- `src/lib/server/services/period-summary/period-summary-calculator.ts`
- `src/lib/server/services/api-services/types.ts`
- `src/lib/server/services/api-services/cache.ts`
- `src/lib/server/services/api-services/in-memory.ts`
- `src/lib/server/services/api-services/d1.ts`
- `src/lib/server/services/day-entry/replay.ts`
- `src/lib/server/services/day-entry/commands.ts`
- `src/lib/server/db/budget-period-validation.ts`
- `src/lib/dashboard/types.ts`
- `src/lib/dashboard/date.ts`
- `src/lib/dashboard/api.ts`
- `src/lib/dashboard/page-controller.svelte.ts`
- `src/lib/components/dashboard/DashboardWorkspace.svelte`
- `src/lib/components/dashboard/CreatePeriodPanel.svelte`
- `src/lib/components/dashboard/PeriodSettingsPanel.svelte`
- `src/lib/components/budget/BudgetPacePanel.svelte`
- `src/lib/components/budget/BudgetStatsPanel.svelte`
- `src/lib/components/budget/BudgetPeriodForm.svelte`
- `src/lib/components/day-entry/DayEntryPreview.svelte`
- `src/lib/components/day-entry/DayEntryForm.svelte`
- `src/lib/components/day-entry/HistoryRow.svelte`
- `src/lib/components/calendar/calendar-grid.ts`
- `src/lib/components/calendar/PeriodCalendarMonth.svelte`
- `tests/unit/period-summary-calculator.test.ts`
- `tests/unit/day-entry-replay.test.ts`
- `tests/unit/budget-period-validation.test.ts`
- `tests/unit/dashboard-date.test.ts`
- `tests/unit/dashboard-api.test.ts`

**Modify:**

- `src/lib/server/services/month-summary-service.ts`
- `src/lib/server/services/day-entry-service.ts`
- `src/lib/server/db/budget-period-repository.ts`
- `src/lib/server/db/day-entry-writer.ts`
- `src/routes/+page.svelte`
- `src/lib/components/BudgetSummary.svelte`
- `src/lib/components/DayEntryModal.svelte`
- `src/lib/components/HistoryPanel.svelte`
- `src/lib/components/PeriodCalendar.svelte`
- `src/lib/components/PeriodRangePicker.svelte`
- Existing tests under `tests/unit`, `tests/integration/api`, and `tests/e2e`

**Delete:**

- None initially. Delete only dead private helpers after their replacements are green and imports are stable.

## Task Dependency Graph

| Task                              | Depends On                   | Dependents                                       | Reason                                            |
| --------------------------------- | ---------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| T1 Contract Baseline              | None                         | T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15 | Freezes current behavior before refactor          |
| T2 Summary Characterization       | T1                           | T5, T15                                          | Protects period summary semantics                 |
| T3 Day Entry Characterization     | T1                           | T6, T8, T15                                      | Protects replay and D1 behavior                   |
| T4 UI Characterization            | T1                           | T9, T10, T11, T12, T13, T14                      | Protects dashboard and component behavior         |
| T5 Extract Period Summary         | T2                           | T15                                              | Creates pure calculation boundary                 |
| T6 Extract Day Entry Replay       | T3                           | T8, T15                                          | Creates shared replay/command boundary            |
| T7 Extract Period Validation      | T1                           | T15                                              | Removes duplicated repository validation          |
| T8 Clean D1 Writer                | T3, T6                       | T15                                              | Keeps atomic writer stable while reducing density |
| T9 Extract Dashboard API/Date     | T4                           | T10                                              | Removes fetch/date helpers from page              |
| T10 Extract Dashboard State       | T9                           | T11, T16                                         | Moves orchestration out of `+page.svelte`         |
| T11 Split Dashboard Shell         | T10                          | T16                                              | Shrinks page markup                               |
| T12 Split BudgetSummary           | T4                           | T16                                              | Component-local cleanup                           |
| T13 Split DayEntry/History UI     | T4                           | T16                                              | Component-local cleanup                           |
| T14 Split Calendar/Range UI       | T4                           | T16                                              | Component-local cleanup                           |
| T15 Split API Service Composition | T5, T6, T7, T8               | T16                                              | Decomposes `month-summary-service.ts` safely      |
| T16 Integration Stabilization     | T10, T11, T12, T13, T14, T15 | T17                                              | Reconciles imports, façades, and route behavior   |
| T17 Final QA and Review           | T16                          | None                                             | Full gates and rollback-ready finish              |

## Parallel Execution Graph

Wave 1, start immediately:

- T1 Contract Baseline
- T2 Summary Characterization
- T3 Day Entry Characterization
- T4 UI Characterization

Wave 2, after Wave 1:

- T5 Extract Period Summary
- T6 Extract Day Entry Replay
- T7 Extract Period Validation
- T9 Extract Dashboard API/Date

Wave 3, after relevant Wave 2 tasks:

- T8 Clean D1 Writer, depends on T6
- T10 Extract Dashboard State, depends on T9
- T12 Split BudgetSummary, depends on T4
- T13 Split DayEntry/History UI, depends on T4
- T14 Split Calendar/Range UI, depends on T4

Wave 4, integration:

- T11 Split Dashboard Shell, depends on T10
- T15 Split API Service Composition, depends on T5, T6, T7, T8

Wave 5, final:

- T16 Integration Stabilization
- T17 Final QA and Review

Critical Path: T1 → T3 → T6 → T8 → T15 → T16 → T17

Estimated Parallel Speedup: about 45-55% faster than sequential execution if server, dashboard API, and component splits are delegated separately.

## Global Skills Evaluation

Use these as defaults for every task unless overridden.

- INCLUDED `superpowers/using-superpowers`: required at conversation/task start.
- INCLUDED `superpowers/test-driven-development`: refactoring must be characterization-first and red/green/refactor.
- INCLUDED `superpowers/verification-before-completion`: required before claiming each task complete.
- INCLUDED `git-master`: required for read-only history/status and all commits.
- INCLUDED `superpowers/subagent-driven-development`: recommended execution mode for this parallel plan.
- INCLUDED `superpowers/dispatching-parallel-agents`: required for wave-based independent work.
- INCLUDED `superpowers/writing-plans`: this is a plan.
- OMITTED `init-deep`: AGENTS.md already exists; not initializing knowledge base.
- OMITTED `remove-ai-slops`: only use if cleanup specifically targets AI-slop patterns after refactor.
- OMITTED `review-work`: use after significant implementation, not during each coding task.
- OMITTED `superpowers/brainstorming`: already used for design orientation; not needed per executor task unless scope changes.
- OMITTED `superpowers/executing-plans`: alternative to subagent-driven execution, not both by default.
- OMITTED `superpowers/finishing-a-development-branch`: use after all implementation passes.
- OMITTED `superpowers/receiving-code-review`: use only if review feedback arrives.
- OMITTED `superpowers/requesting-code-review`: use after implementation milestones or final work.
- OMITTED `superpowers/systematic-debugging`: use when a test fails unexpectedly, not preloaded everywhere.
- OMITTED `superpowers/using-git-worktrees`: recommended before execution if isolation is desired; not task-local.
- OMITTED `superpowers/writing-skills`: no skill authoring.
- CONDITIONAL `frontend-ui-ux`: include for UI component/layout tasks.
- CONDITIONAL `playwright`: include for browser/e2e verification tasks.

## Tasks

### Task 1: Contract Baseline

**Description:** Freeze public behavior and document current refactor boundaries before code movement.

**Delegation Recommendation:**

- Category: `writing` - contract/documentation and test inventory.
- Skills: [`superpowers/test-driven-development`, `git-master`, `superpowers/verification-before-completion`] - baseline requires test-first discipline, status/log awareness, and command evidence.

**Depends On:** None.

**Files:**

- Inspect: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md`
- Create: `docs/superpowers/plans/2026-05-31-full-stack-refactor.md`
- Inspect: `src/routes/api/periods/**/+server.ts`
- Inspect: `tests/unit/non-migration-drizzle-guard.test.ts`

**TDD Steps:**

- Run `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` as baseline.
- If any baseline failure exists, stop and record it before refactoring.
- Confirm no external API route paths or response keys are planned for removal.

**Acceptance Criteria:**

- A short contract note exists in the plan/spec or task summary.
- Baseline failures, if any, are documented and not attributed to refactoring.
- The raw D1 exception remains limited to `src/lib/server/db/day-entry-writer.ts`.

### Task 2: Summary Characterization

**Description:** Add or strengthen tests around `buildPeriodSummary` before extraction.

**Delegation Recommendation:**

- Category: `unspecified-low` - focused test coverage.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - characterization and verification.

**Depends On:** T1.

**Files:**

- Modify: `tests/unit/month-summary-service.test.ts`
- Later target: `tests/unit/period-summary-calculator.test.ts`

**TDD Steps:**

- Add characterization cases for future period, cross-month ranges, same-day spending not changing pace base, out-of-period totals ignored, and overspend.
- Run `pnpm test:unit -- tests/unit/month-summary-service.test.ts`.
- Expected: tests pass before extraction; these become the safety net.

**Acceptance Criteria:**

- Existing summary semantics are covered before production movement.
- Tests assert behavior, not helper names.

### Task 3: Day Entry Characterization

**Description:** Protect day-entry add/overwrite/edit/delete replay and D1 atomic behavior.

**Delegation Recommendation:**

- Category: `unspecified-low` - focused service/integration tests.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - behavior locking.

**Depends On:** T1.

**Files:**

- Modify: `tests/integration/api/days.test.ts`
- Modify: `tests/integration/api/months.test.ts`
- Inspect: `src/lib/server/db/day-entry-writer.ts`

**TDD Steps:**

- Confirm current tests cover replay edit/delete; add missing D1-path regression only if gaps remain.
- Run `pnpm test:integration -- tests/integration/api/days.test.ts tests/integration/api/months.test.ts`.

**Acceptance Criteria:**

- Replay behavior remains stable for add, overwrite, edit, delete, and empty-history delete.
- D1-path history mutation remains covered.

### Task 4: UI Characterization

**Description:** Freeze dashboard user flows and key selectors before Svelte component splits.

**Delegation Recommendation:**

- Category: `visual-engineering` - UI behavior and component boundaries.
- Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`] - visual/user-flow preservation.

**Depends On:** T1.

**Files:**

- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `tests/e2e/dashboard-day-entry.spec.ts`
- Inspect: `src/routes/+page.svelte`
- Inspect: `src/lib/components/*.svelte`

**TDD Steps:**

- Add missing e2e assertions for period create, period update, modal open/close, history edit state, and mobile visibility only if not covered.
- Run `pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`.

**Acceptance Criteria:**

- Main dashboard flows are protected before moving markup/state.
- Existing `data-testid` selectors are preserved or intentionally updated with tests.

### Task 5: Extract Period Summary

**Description:** Move pure summary calculation from `month-summary-service.ts` into focused period-summary modules.

**Delegation Recommendation:**

- Category: `deep` - core service extraction with domain semantics.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - safe pure extraction.

**Depends On:** T2.

**Files:**

- Create: `src/lib/server/services/period-summary/types.ts`
- Create: `src/lib/server/services/period-summary/date-range.ts`
- Create: `src/lib/server/services/period-summary/food-pace.ts`
- Create: `src/lib/server/services/period-summary/period-summary-calculator.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`
- Create/modify: `tests/unit/period-summary-calculator.test.ts`

**TDD Steps:**

- Move tests from `month-summary-service.test.ts` to target pure calculator API.
- Run focused test and verify red only where imports do not exist.
- Extract `buildDateRange`, daily total mapping, food pace, recommendations, and final summary assembly.
- Keep `buildPeriodSummary` exported from `month-summary-service.ts` as a façade during transition.
- Run `pnpm test:unit -- tests/unit/month-summary-service.test.ts tests/unit/period-summary-calculator.test.ts`.

**Acceptance Criteria:**

- `month-summary-service.ts` no longer owns pure calculation internals.
- Public `PeriodSummary` shape is unchanged.
- Existing imports still compile.

### Task 6: Extract Day Entry Replay

**Description:** Split replay/command preparation from `DayEntryService` persistence.

**Delegation Recommendation:**

- Category: `unspecified-high` - domain service refactor with transaction risks.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - replay correctness.

**Depends On:** T3.

**Files:**

- Create: `src/lib/server/services/day-entry/replay.ts`
- Create: `src/lib/server/services/day-entry/commands.ts`
- Modify: `src/lib/server/services/day-entry-service.ts`
- Create: `tests/unit/day-entry-replay.test.ts`
- Modify: `tests/integration/api/days.test.ts`

**TDD Steps:**

- Add pure tests for replay ordering and overwrite semantics in `day-entry-replay.test.ts`.
- Extract `replayDailyHistories` first.
- Extract command validation/preparation only if it reduces coupling without duplicating repository checks.
- Keep `DayEntryService` class as orchestration/persistence façade.

**Acceptance Criteria:**

- Replay can be tested without repositories or D1.
- Service integration tests remain green.
- No public route behavior changes.

### Task 7: Extract Period Validation

**Description:** Move shared budget-period validation out of the repository implementations.

**Delegation Recommendation:**

- Category: `unspecified-low` - focused validation extraction.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - behavior preservation.

**Depends On:** T1.

**Files:**

- Create: `src/lib/server/db/budget-period-validation.ts`
- Modify: `src/lib/server/db/budget-period-repository.ts`
- Create: `tests/unit/budget-period-validation.test.ts`
- Modify: `tests/unit/budget-period.test.ts`
- Modify: `tests/integration/api/periods.test.ts`

**TDD Steps:**

- Characterize overlap, predecessor continuity, successor continuity, invalid range, and invalid budget.
- Extract pure validation functions used by in-memory and D1 paths.
- Preserve `PeriodValidationError` code strings.

**Acceptance Criteria:**

- Repository file loses validation density.
- Existing API errors/statuses remain unchanged.
- No schema or migration changes.

### Task 8: Clean D1 Writer

**Description:** Reduce `day-entry-writer.ts` density while preserving the raw D1 atomic exception.

**Delegation Recommendation:**

- Category: `unspecified-high` - D1 atomic persistence risk.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`] - use debugging skill if D1 fake diverges.

**Depends On:** T3, T6.

**Files:**

- Modify: `src/lib/server/db/day-entry-writer.ts`
- Modify if needed: `tests/integration/helpers/period-d1-fake.ts`
- Modify: `tests/unit/non-migration-drizzle-guard.test.ts` only if an intentional raw-D1 boundary file is added.

**TDD Steps:**

- Run current D1-path tests first.
- Extract statement-building helpers inside the same file first to avoid guard churn.
- If creating a new helper file, ensure it does not introduce `.prepare(` or `db.batch(` outside the allowed file unless the guard is deliberately updated with rationale.
- Run `pnpm test:unit -- tests/unit/non-migration-drizzle-guard.test.ts`.
- Run `pnpm test:integration -- tests/integration/api/months.test.ts`.

**Acceptance Criteria:**

- Atomic D1 behavior is unchanged.
- Guard remains green.
- No new runtime dependency or migration.

### Task 9: Extract Dashboard API and Date Helpers

**Description:** Move fetch/effect/date utilities out of `+page.svelte`.

**Delegation Recommendation:**

- Category: `unspecified-low` - client helper extraction.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - helper tests.

**Depends On:** T4.

**Files:**

- Create: `src/lib/dashboard/types.ts`
- Create: `src/lib/dashboard/date.ts`
- Create: `src/lib/dashboard/api.ts`
- Modify: `src/routes/+page.svelte`
- Create: `tests/unit/dashboard-date.test.ts`
- Create: `tests/unit/dashboard-api.test.ts`

**TDD Steps:**

- Test `addDays`, `toPeriodId`, API error parsing, and endpoint URL construction.
- Extract `fetchJsonEffect`, response types, and route-specific API calls.
- Inject `fetch` for unit tests; do not add dependencies.

**Acceptance Criteria:**

- `+page.svelte` no longer contains generic fetch/error parsing/date helpers.
- API URLs and fallback messages remain identical.

### Task 10: Extract Dashboard State

**Description:** Move dashboard orchestration state from `+page.svelte` into a focused controller or smaller Svelte module.

**Delegation Recommendation:**

- Category: `unspecified-high` - Svelte 5 state extraction risk.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`] - state behavior preservation.

**Depends On:** T9.

**Files:**

- Create: `src/lib/dashboard/page-controller.svelte.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `tests/e2e/dashboard-day-entry.spec.ts`

**TDD Steps:**

- Prefer plain TS helpers for derivations first.
- If using `.svelte.ts`, verify SvelteKit/svelte-check support with `pnpm check`.
- Move modal/history/period handlers behind a controller API without changing child props yet.
- Run `pnpm check` and focused e2e.

**Acceptance Criteria:**

- `+page.svelte` owns rendering composition, not API orchestration internals.
- Modal preview values and history mutation flows remain unchanged.

### Task 11: Split Dashboard Shell

**Description:** Extract page-level markup for workspace, create period, and period settings.

**Delegation Recommendation:**

- Category: `visual-engineering` - UI component extraction.
- Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`] - preserve UX and selectors.

**Depends On:** T10.

**Files:**

- Create: `src/lib/components/dashboard/DashboardWorkspace.svelte`
- Create: `src/lib/components/dashboard/CreatePeriodPanel.svelte`
- Create: `src/lib/components/dashboard/PeriodSettingsPanel.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `tests/e2e/dashboard.spec.ts`

**TDD Steps:**

- Add/confirm e2e coverage for initial period creation and current/next period forms.
- Extract `create-period-panel` without changing `data-testid`.
- Move page styles with the extracted markup where possible.

**Acceptance Criteria:**

- `+page.svelte` is substantially smaller and primarily composes components.
- Empty-state and non-empty workspace flows remain identical.

### Task 12: Split BudgetSummary

**Description:** Break `BudgetSummary.svelte` into pace, stats, selector, and form subcomponents.

**Delegation Recommendation:**

- Category: `visual-engineering` - component-focused UI refactor.
- Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`] - preserve dashboard UX.

**Depends On:** T4.

**Files:**

- Create: `src/lib/components/budget/BudgetPacePanel.svelte`
- Create: `src/lib/components/budget/BudgetStatsPanel.svelte`
- Create: `src/lib/components/budget/BudgetPeriodForm.svelte`
- Modify: `src/lib/components/BudgetSummary.svelte`
- Modify: `tests/e2e/dashboard.spec.ts`

**TDD Steps:**

- Use existing e2e tests for budget values, pace panel, period update error.
- Extract one subcomponent at a time.
- Run `pnpm check` after each extraction batch.

**Acceptance Criteria:**

- Public props of `BudgetSummary.svelte` remain stable for callers.
- Test IDs such as `today-food-allowance`, `budget-value`, `period-select` remain stable.

### Task 13: Split DayEntryModal and HistoryPanel

**Description:** Extract modal preview/form and per-history-row UI.

**Delegation Recommendation:**

- Category: `visual-engineering` - modal and mobile UI behavior.
- Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`] - preserve interaction behavior.

**Depends On:** T4.

**Files:**

- Create: `src/lib/components/day-entry/DayEntryPreview.svelte`
- Create: `src/lib/components/day-entry/DayEntryForm.svelte`
- Create: `src/lib/components/day-entry/HistoryRow.svelte`
- Modify: `src/lib/components/DayEntryModal.svelte`
- Modify: `src/lib/components/HistoryPanel.svelte`
- Modify: `tests/e2e/dashboard-day-entry.spec.ts`

**TDD Steps:**

- Lock edit/delete/invalid input behavior with existing e2e tests.
- Extract preview first, then form, then row.
- Preserve `li.editing`, button labels, and modal test IDs.

**Acceptance Criteria:**

- `DayEntryModal.svelte` and `HistoryPanel.svelte` are smaller and focused.
- Mobile history edit/delete controls remain visible.

### Task 14: Split Calendar and Range Logic

**Description:** Extract calendar-grid generation and range-picker helpers.

**Delegation Recommendation:**

- Category: `visual-engineering` - UI logic extraction.
- Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`] - calendar UX preservation.

**Depends On:** T4.

**Files:**

- Create: `src/lib/components/calendar/calendar-grid.ts`
- Create: `src/lib/components/calendar/PeriodCalendarMonth.svelte`
- Modify: `src/lib/components/PeriodCalendar.svelte`
- Modify: `src/lib/components/PeriodRangePicker.svelte`
- Create/modify: `tests/unit/calendar-grid.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`

**TDD Steps:**

- Test cross-month period grid generation in pure TS.
- Extract month table rendering while preserving `calendar-day-${date}` and `used-${date}` selectors.
- Keep Bits UI `RangeCalendar` behavior unchanged.

**Acceptance Criteria:**

- Calendar month construction is unit-testable.
- Period range picker behavior and selectors remain unchanged.

### Task 15: Split API Service Composition

**Description:** Decompose `month-summary-service.ts` service wiring/cache while preserving façade exports.

**Delegation Recommendation:**

- Category: `deep` - central server composition refactor.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`] - high-risk integration refactor.

**Depends On:** T5, T6, T7, T8.

**Files:**

- Create: `src/lib/server/services/api-services/types.ts`
- Create: `src/lib/server/services/api-services/cache.ts`
- Create: `src/lib/server/services/api-services/in-memory.ts`
- Create: `src/lib/server/services/api-services/d1.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`
- Modify: `src/routes/+page.server.ts`
- Modify: `src/routes/api/periods/**/+server.ts`
- Modify: `tests/integration/api/periods.test.ts`
- Modify: `tests/integration/api/months.test.ts`

**TDD Steps:**

- Keep existing imports green first by re-exporting from `month-summary-service.ts`.
- Move types, cache, in-memory wiring, D1 wiring one at a time.
- Update internal imports only after façade tests pass.
- Run `pnpm test:integration -- tests/integration/api/periods.test.ts tests/integration/api/months.test.ts`.

**Acceptance Criteria:**

- Routes remain compatible.
- `month-summary-service.ts` becomes a façade plus minimal summary export, not a 900-line orchestrator.
- D1/in-memory service parity remains tested.

### Task 16: Integration Stabilization

**Description:** Reconcile imports, styles, façades, and duplicate types after parallel work lands.

**Delegation Recommendation:**

- Category: `unspecified-high` - cross-cutting integration.
- Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`] - integration failures likely.

**Depends On:** T10, T11, T12, T13, T14, T15.

**Files:**

- Modify as needed: all touched files from T5-T15
- Modify: `tests/unit/non-migration-drizzle-guard.test.ts` only for intentional boundary updates
- Modify: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md` only if architecture notes need updating

**TDD Steps:**

- Run `pnpm format:check`, then `pnpm lint`, then `pnpm check`.
- Fix type/import/format issues without changing behavior.
- Run unit and integration suites.
- Run focused e2e for dashboard.

**Acceptance Criteria:**

- No duplicate orphan types remain where shared types now exist.
- No behavior-only tests require expectation changes except import paths or selector-preserving component moves.
- No new runtime dependencies.

### Task 17: Final QA and Review

**Description:** Run full quality gates, review risk, and prepare rollback-ready branch state.

**Delegation Recommendation:**

- Category: `unspecified-high` - final verification and review coordination.
- Skills: [`superpowers/verification-before-completion`, `review-work`, `git-master`, `playwright`, `superpowers/requesting-code-review`] - evidence, review, git hygiene, browser verification.

**Depends On:** T16.

**Files:**

- No planned production edits unless QA finds issues.
- Inspect: `git diff`, `git status`, quality command outputs.

**Verification Commands:**

- `pnpm format:check`
- `pnpm lint`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm build`
- `pnpm test:e2e`

**Acceptance Criteria:**

- All required gates pass or failures are clearly documented with root cause.
- Review findings are resolved or explicitly deferred.
- Commit history is atomic and rollback-ready.

## Verification Steps By Wave

Wave 1:

- `pnpm format:check`
- `pnpm lint`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration`
- Focused: `pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`

Wave 2:

- `pnpm test:unit -- tests/unit/month-summary-service.test.ts tests/unit/period-summary-calculator.test.ts tests/unit/day-entry-replay.test.ts tests/unit/budget-period-validation.test.ts tests/unit/dashboard-date.test.ts tests/unit/dashboard-api.test.ts`
- `pnpm test:integration -- tests/integration/api/days.test.ts tests/integration/api/periods.test.ts`

Wave 3:

- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration -- tests/integration/api/months.test.ts`
- `pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`

Wave 4:

- `pnpm format:check`
- `pnpm lint`
- `pnpm check`
- `pnpm test:integration`
- `pnpm build`

Wave 5:

- `pnpm format:check`
- `pnpm lint`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm build`
- `pnpm test:e2e`

## Risk Assessment

| Risk                                   | Impact | Mitigation                                                                  |
| -------------------------------------- | ------ | --------------------------------------------------------------------------- |
| API behavior drift                     | High   | Keep routes and response shapes unchanged; characterize first               |
| Summary calculation drift              | High   | Pure unit tests before extraction                                           |
| D1 writer atomicity regression         | High   | Keep raw D1 boundary explicit; run D1-path integration tests                |
| Svelte rune extraction incompatibility | Medium | Prefer plain TS first; if `.svelte.ts` used, gate with `pnpm check`         |
| E2E selector breakage                  | Medium | Preserve `data-testid` values and button labels                             |
| Parallel merge conflicts               | Medium | Do not assign same file to two agents in same wave except final integration |
| File moves causing import churn        | Medium | Use façade exports during transition                                        |
| Over-refactoring                       | Medium | Extract only around listed hot spots; no runtime dependencies               |
| Existing dirty worktree artifacts      | Low    | Do not touch unrelated `.omo/` or local state                               |

## Rollback Strategy

- Work in an isolated branch or git worktree before execution.
- Commit each task atomically with its direct tests.
- Keep façade exports until final integration so individual commits can be reverted.
- If a wave fails, revert only that wave's commits rather than resetting the branch.
- If D1 writer changes fail, revert T8 first; it is intentionally isolated.
- If UI extraction fails e2e, revert the specific component split and keep prior behavior.
- Do not use destructive commands such as `git reset --hard` without explicit approval.

## Commit Strategy

Repository style is semantic. Use focused commits in dependency order.

Suggested atomic commits:

- `test: characterize period summary behavior`
- `refactor: extract period summary calculator`
- `test: characterize day entry replay behavior`
- `refactor: extract day entry replay helpers`
- `refactor: extract budget period validation`
- `refactor: simplify d1 day entry writer`
- `test: cover dashboard client helpers`
- `refactor: extract dashboard api helpers`
- `refactor: extract dashboard state controller`
- `refactor: split dashboard period panels`
- `refactor: split budget summary panels`
- `refactor: split day entry modal sections`
- `refactor: split period calendar rendering`
- `refactor: split api service composition`
- `chore: stabilize refactor imports and formatting`
- `test: verify full refactor gates`

Rules:

- Pair test and implementation in the same commit.
- Do not mix server and UI refactors in one commit.
- Do not commit generated/local state.
- For 10+ changed files, expect at least 5 commits.

## Success Criteria

- `src/routes/+page.svelte` becomes a small composition layer.
- `month-summary-service.ts` no longer owns pure calculation, D1/in-memory service construction, cache, and adapters in one file.
- `day-entry-service.ts` delegates replay and command prep to focused modules.
- `budget-period-repository.ts` delegates reusable validation.
- `day-entry-writer.ts` is clearer while preserving the raw D1 atomic boundary.
- Large UI components are split without visual or selector regressions.
- No route paths or response shapes change.
- No runtime dependencies are added.
- All quality gates pass.

## TODO List

### Wave 1 (Start Immediately - No Dependencies)

- [ ] **1. Contract Baseline**
  - What: Inspect specs/routes/guard tests, document unchanged API contract, run baseline checks.
  - Depends: None
  - Blocks: 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
  - Category: `writing`
  - Skills: [`superpowers/test-driven-development`, `git-master`, `superpowers/verification-before-completion`]
  - QA: `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration`

- [ ] **2. Summary Characterization**
  - What: Add/confirm unit tests for period summary edge cases before extraction.
  - Depends: 1
  - Blocks: 5, 15
  - Category: `unspecified-low`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/month-summary-service.test.ts`

- [ ] **3. Day Entry Characterization**
  - What: Add/confirm service and D1-path tests for replay, edit/delete, overwrite, and atomic writer behavior.
  - Depends: 1
  - Blocks: 6, 8, 15
  - Category: `unspecified-low`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:integration -- tests/integration/api/days.test.ts tests/integration/api/months.test.ts`

- [ ] **4. UI Characterization**
  - What: Add/confirm e2e coverage for dashboard, modal, mobile history controls, period create/update.
  - Depends: 1
  - Blocks: 9, 10, 11, 12, 13, 14
  - Category: `visual-engineering`
  - Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`

### Wave 2 (After Wave 1 Completes)

- [ ] **5. Extract Period Summary**
  - What: Create `period-summary/*` modules and keep `month-summary-service.ts` façade export.
  - Depends: 2
  - Blocks: 15
  - Category: `deep`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/month-summary-service.test.ts tests/unit/period-summary-calculator.test.ts`

- [ ] **6. Extract Day Entry Replay**
  - What: Create `day-entry/replay.ts` and `day-entry/commands.ts`; keep `DayEntryService` as orchestration façade.
  - Depends: 3
  - Blocks: 8, 15
  - Category: `unspecified-high`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/day-entry-replay.test.ts && pnpm test:integration -- tests/integration/api/days.test.ts`

- [ ] **7. Extract Period Validation**
  - What: Move overlap/range/continuity validation to `budget-period-validation.ts`.
  - Depends: 1
  - Blocks: 15
  - Category: `unspecified-low`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/budget-period.test.ts tests/unit/budget-period-validation.test.ts`

- [ ] **9. Extract Dashboard API/Date Helpers**
  - What: Create `src/lib/dashboard/types.ts`, `date.ts`, and `api.ts`; remove generic helpers from `+page.svelte`.
  - Depends: 4
  - Blocks: 10
  - Category: `unspecified-low`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/dashboard-date.test.ts tests/unit/dashboard-api.test.ts`

### Wave 3 (After Relevant Wave 2 Tasks Complete)

- [ ] **8. Clean D1 Writer**
  - What: Simplify `day-entry-writer.ts` internals while preserving raw D1 atomic exception and guard.
  - Depends: 3, 6
  - Blocks: 15
  - Category: `unspecified-high`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`]
  - QA: `pnpm test:unit -- tests/unit/non-migration-drizzle-guard.test.ts && pnpm test:integration -- tests/integration/api/months.test.ts`

- [ ] **10. Extract Dashboard State**
  - What: Move period/modal/history orchestration out of `+page.svelte` into controller/helpers.
  - Depends: 9
  - Blocks: 11, 16
  - Category: `unspecified-high`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm check && pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`

- [ ] **12. Split BudgetSummary**
  - What: Extract pace, stats, and budget form subcomponents while preserving public props/selectors.
  - Depends: 4
  - Blocks: 16
  - Category: `visual-engineering`
  - Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm check && pnpm test:e2e -- tests/e2e/dashboard.spec.ts`

- [ ] **13. Split DayEntryModal and HistoryPanel**
  - What: Extract preview/form/history-row subcomponents while preserving edit/delete behavior.
  - Depends: 4
  - Blocks: 16
  - Category: `visual-engineering`
  - Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm check && pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts`

- [ ] **14. Split Calendar and Range Logic**
  - What: Extract calendar grid pure helper and month rendering component; preserve Bits UI range behavior.
  - Depends: 4
  - Blocks: 16
  - Category: `visual-engineering`
  - Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm test:unit -- tests/unit/calendar-grid.test.ts && pnpm check`

### Wave 4 (Integration)

- [ ] **11. Split Dashboard Shell**
  - What: Extract dashboard workspace, create-period panel, and period-settings panel from `+page.svelte`.
  - Depends: 10
  - Blocks: 16
  - Category: `visual-engineering`
  - Skills: [`frontend-ui-ux`, `playwright`, `superpowers/test-driven-development`, `superpowers/verification-before-completion`]
  - QA: `pnpm check && pnpm test:e2e -- tests/e2e/dashboard.spec.ts`

- [ ] **15. Split API Service Composition**
  - What: Move API service types/cache/in-memory/D1 wiring to `api-services/*`; keep façade exports stable.
  - Depends: 5, 6, 7, 8
  - Blocks: 16
  - Category: `deep`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`]
  - QA: `pnpm test:integration -- tests/integration/api/periods.test.ts tests/integration/api/months.test.ts`

### Wave 5 (Final)

- [ ] **16. Integration Stabilization**
  - What: Reconcile imports, shared types, formatting, route compatibility, and guard expectations.
  - Depends: 10, 11, 12, 13, 14, 15
  - Blocks: 17
  - Category: `unspecified-high`
  - Skills: [`superpowers/test-driven-development`, `superpowers/verification-before-completion`, `superpowers/systematic-debugging`]
  - QA: `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build`

- [ ] **17. Final QA and Review**
  - What: Run full gates, request review, prepare rollback-ready atomic commit history.
  - Depends: 16
  - Blocks: None
  - Category: `unspecified-high`
  - Skills: [`superpowers/verification-before-completion`, `review-work`, `git-master`, `playwright`, `superpowers/requesting-code-review`]
  - QA: `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build && pnpm test:e2e`
