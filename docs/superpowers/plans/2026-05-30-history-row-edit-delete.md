# History Row Edit/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make day-entry history rows editable/deletable one row at a time, remove the old day-entry overwrite choice from the primary input UI, and match the approved desktop/mobile mockups.

**Architecture:** Keep the period-first API as the only update surface. New day entries become add-only from the UI, while existing `overwrite` history rows remain valid data and are preserved during replay. History edit/delete mutates the selected history row, replays that day's remaining history chain in chronological order, and atomically updates `daily_totals` so `beforeTotalYen` / `afterTotalYen` stay consistent.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Effect, Drizzle ORM, Cloudflare D1, Vitest, Playwright, lucide-svelte.

---

## Context

Subagents were used for read-only exploration before this plan:

- UI explorer: `DayEntryModal` owns the current add/overwrite form and embeds `HistoryPanel`; `HistoryPanel` is presentational and needs per-row actions/events.
- API explorer: only `POST .../add`, `PUT .../overwrite`, and `GET .../history` exist today. There is no history update/delete route or repository method. History edit/delete must recompute the day total and affected history rows, not merely update/delete a row.

Current screenshots:

- `output/playwright/current-history-area-pc.png`
- `output/playwright/current-history-area-mobile.png`

Approved target behavior from the generated images:

- The primary day input no longer shows the operation selector or any `上書き` control.
- The primary day input is add-only and keeps `入力額 (円)`, `メモ`, `閉じる`, `保存する`.
- Each history row has touch-friendly `編集` and `削除` actions.
- Editing happens inline in the history row with `入力額`, `メモ`, `保存`, `キャンセル`.
- Mobile layout stacks cleanly and keeps row actions readable.

## File Map

- Modify: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md`
  - Update the spec because it currently says add/overwrite is maintained and history delete is out of scope.
- Modify: `src/lib/server/db/daily-history-repository.ts`
  - Add history lookup, per-day chronological listing, row update/delete, and replay support for in-memory and D1 paths.
- Modify: `src/lib/server/db/daily-total-repository.ts`
  - Add a way to set the final day total to the replay result, and optionally clear the row when no history remains.
- Modify: `src/lib/server/db/day-entry-writer.ts`
  - Add the D1-only atomic replay writer. This is the production D1 mutation boundary for history edit/delete.
- Modify: `src/lib/server/services/day-entry-service.ts`
  - Add transaction-safe `updateHistoryEntry` and `deleteHistoryEntry` methods for the in-memory service.
- Modify: `src/lib/server/services/month-summary-service.ts`
  - Extend `DayEntryServicePort` and D1 service creation with history edit/delete operations.
- Modify: `src/lib/server/validation/day.ts`
  - Reuse or add validation for history mutation payloads.
- Create: `src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server.ts`
  - Add `PATCH` and `DELETE` handlers.
- Modify: `src/routes/+page.svelte`
  - Remove `modalOperation`; always call add for primary save. Add history edit/delete fetch effects and refresh summary/history.
- Modify: `src/lib/components/DayEntryModal.svelte`
  - Remove operation prop/binding and operation selector. Pass history callbacks to `HistoryPanel`.
- Modify: `src/lib/components/HistoryPanel.svelte`
  - Add per-row edit/delete controls and inline edit state.
- Modify: `tests/integration/api/days.test.ts`
  - Service-level history edit/delete replay tests.
- Modify: `tests/integration/api/periods.test.ts`
  - Route-level history edit/delete tests.
- Modify: `tests/integration/api/months.test.ts`
  - D1-path history edit/delete and rollback tests through `createD1ApiServices` / default routes.
- Modify as needed: `tests/integration/helpers/period-d1-fake.ts`
  - Support any new Drizzle query shapes used by history mutation tests.
- Modify: `tests/e2e/dashboard-day-entry.spec.ts`
  - Replace overwrite UI flow with add-only input plus history row edit/delete flows.

## Behavioral Decisions

- Keep existing `operation_type` values `add` and `overwrite` in schema. Do not migrate existing data.
- Keep the existing overwrite API route unless a later cleanup task explicitly removes it. This task removes the user-facing overwrite button, not every server capability.
- Primary entry form always appends an `add` history row.
- Editing a history row changes only `input_yen` and `memo`; it preserves that row's `operation_type` and `created_at`.
- Deleting a history row removes that history event.
- After edit/delete, replay all remaining histories for the same `(budget_period_id, date)` from oldest to newest:
  - `add`: `after = before + inputYen`
  - `overwrite`: `after = inputYen`
- Persist replayed `before_total_yen` and `after_total_yen` for every remaining row on that day.
- Set `daily_totals.total_used_yen` to the replay result. If the repository has a clean delete path, delete the row when no history remains; otherwise upsert `0` and verify summaries still display zero correctly.
- Reject history mutation when the history ID does not belong to the requested period/date.
- Preserve period-first invariants: every query must scope by `budget_period_id`; do not add month-first compatibility routes.
- D1 history edit/delete must use one atomic writer path, not independent request-level repository calls. Extend `src/lib/server/db/day-entry-writer.ts` with a batch/transaction-style operation that updates/deletes histories and updates `daily_totals` together.

## Task 1: Update The Spec

**Files:**

- Modify: `docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md`

- [ ] **Step 1: Update requirements text**

Change the current add/overwrite and deletion-out-of-scope statements to reflect the new behavior:

```markdown
- 新規の日次入力は追加操作として登録する
- 既存履歴には `add` / `overwrite` が残り得るため、履歴編集・削除時の再計算では両方の operation_type を扱う
- 日詳細モーダルでは、その日の履歴を新しい順で表示し、各履歴行を編集・削除できる
```

- [ ] **Step 2: Update API design**

Add the history row mutation endpoints:

```markdown
- `PATCH /api/periods/:periodId/days/:date/history/:historyId`
- `DELETE /api/periods/:periodId/days/:date/history/:historyId`
```

- [ ] **Step 3: Update UI design**

Replace `add / overwrite 入力` with:

```markdown
- 新規入力は追加のみ
- 履歴行ごとのインライン編集
- 履歴行ごとの削除
```

- [ ] **Step 4: Check diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-04-22-budget-period-calendar-design.md
```

Expected: only this feature's spec statements changed.

## Task 2: Add Domain Tests For History Replay

**Files:**

- Modify: `tests/integration/api/days.test.ts`

- [ ] **Step 1: Write failing service test for editing an add row**

Add a test that creates one period, adds two entries on the same date, edits the first history row from `1000` to `1500`, and expects:

```ts
expect(persistedDailyTotal?.totalUsedYen).toBe(3500);
expect(historiesOldestFirst).toMatchObject([
  {
    id: "history-id-1",
    inputYen: 1500,
    beforeTotalYen: 0,
    afterTotalYen: 1500,
  },
  {
    id: "history-id-2",
    inputYen: 2000,
    beforeTotalYen: 1500,
    afterTotalYen: 3500,
  },
]);
```

- [ ] **Step 2: Write failing service test for deleting a middle row**

Seed three add rows `1000`, `2000`, `3000`, delete `history-id-2`, and expect the final total to be `4000` with remaining row chain `0 -> 1000 -> 4000`.

- [ ] **Step 3: Write failing service test preserving overwrite semantics**

Seed `add 1000`, `overwrite 500`, `add 200`, edit/delete around the overwrite row, and assert replay still treats the overwrite row as replacement.

- [ ] **Step 4: Write failing service test for deleting the last history row**

Seed one add row, delete it, and expect:

```ts
expect(persistedHistories).toHaveLength(0);
expect(persistedDailyTotal?.totalUsedYen ?? 0).toBe(0);
```

Also assert the period summary/calendar path shows `0 円` or no used amount, matching the current zero-display convention.

- [ ] **Step 5: Run focused tests and verify failure**

Run:

```bash
pnpm test:integration -- tests/integration/api/days.test.ts
```

Expected: tests fail because service methods do not exist yet.

## Task 3: Implement Repository Replay Primitives

**Files:**

- Modify: `src/lib/server/db/daily-history-repository.ts`
- Modify: `src/lib/server/db/daily-total-repository.ts`
- Modify: `src/lib/server/db/day-entry-writer.ts`
- Modify as needed: `tests/integration/helpers/period-d1-fake.ts`

- [ ] **Step 1: Extend repository interfaces**

Add operations that are scoped by period/date/history ID:

```ts
findHistoryById(
  tx: DailyHistoryTransaction,
  input: { budgetPeriodId: string; date: string; historyId: string },
): Effect.Effect<DailyHistoryRecord | null, Error>;

listHistoriesByDateChronological(
  tx: DailyHistoryTransaction,
  date: string,
  budgetPeriodId: string,
): Effect.Effect<DailyHistoryRecord[], Error>;

replaceHistoriesForDate(
  tx: DailyHistoryTransaction,
  input: { budgetPeriodId: string; date: string; histories: DailyHistoryRecord[] },
): Effect.Effect<void, Error>;
```

If `replaceHistoriesForDate` is too broad for D1, use scoped `updateHistory` and `deleteHistory` methods instead, but keep all calls inside one service transaction.

- [ ] **Step 2: Add daily total setter**

Add one operation that sets the replayed final value for a single period/date:

```ts
setDailyTotal(
  tx: DailyTotalTransaction,
  input: {
    budgetPeriodId: string;
    date: string;
    yearMonth: string;
    totalUsedYen: number;
    nowIso: string;
  },
): Effect.Effect<DailyTotalRecord, Error>;
```

If implementing deletion for zero totals, name it explicitly, e.g. `deleteDailyTotal(tx, date, budgetPeriodId)`.

- [ ] **Step 3: Extend the D1 writer for atomic replay**

Do not perform D1 history edit/delete through separate service-level calls to `dailyHistoryRepository` and `dailyTotalRepository`. Add a writer method to `D1DayEntryWriter`, for example:

```ts
writeHistoryReplay(input: {
  budgetPeriodId: string;
  date: string;
  finalTotal: {
    yearMonth: string;
    totalUsedYen: number;
    nowIso: string;
  };
  deleteHistoryIds: string[];
  histories: Array<{
    id: string;
    inputYen: number;
    beforeTotalYen: number;
    afterTotalYen: number;
    memo: string | null;
  }>;
}): Effect.Effect<void, Error>;
```

Implementation requirement:

- Use `database.batch([...])` or the closest D1-supported atomic mechanism already used by `writeDailyEntry`.
- Include the daily total upsert/delete and every history update/delete in the same batch.
- Scope every mutation by `budget_period_id`, `date`, and `id` where applicable.
- Keep `created_at` and `operation_type` unchanged for existing rows.

- [ ] **Step 4: Implement in-memory behavior first**

Use the transaction state arrays/maps directly and preserve current clone/sort behavior.

- [ ] **Step 5: Implement D1 behavior**

Use Drizzle queries only. The D1 service should read the current period/date histories, compute the replay in service code, then call the new writer once for the atomic mutation. Every writer query must include `budget_period_id` and `date`.

- [ ] **Step 6: Run repository-adjacent tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/days.test.ts
```

Expected: tests still fail until service methods exist, but TypeScript should now resolve repository method names once service code is added.

## Task 4: Implement History Edit/Delete Service

**Files:**

- Modify: `src/lib/server/services/day-entry-service.ts`
- Modify: `src/lib/server/services/month-summary-service.ts`

- [ ] **Step 1: Add command types**

Add:

```ts
export type HistoryMutationCommand = {
  periodId: string;
  date: string;
  historyId: string;
};

export type UpdateHistoryCommand = HistoryMutationCommand & {
  inputYen: number;
  memo?: string | null;
};
```

- [ ] **Step 2: Add service methods**

Add:

```ts
updateHistoryEntry(command: UpdateHistoryCommand): Effect.Effect<HistoryReplayResult, Error>;
deleteHistoryEntry(command: HistoryMutationCommand): Effect.Effect<HistoryReplayResult, Error>;
```

Use a result type that can represent empty history after deletion:

```ts
export type HistoryReplayResult = {
  dailyTotal: DailyTotalRecord | null;
  histories: DailyHistoryRecord[];
};
```

- [ ] **Step 3: Add validation and ownership checks**

Inside the transaction:

1. Validate date and yen.
2. Load period by ID.
3. Confirm date is in period.
4. Find the target history by `(periodId, date, historyId)`.
5. Return a 404-compatible domain error when not found.

- [ ] **Step 4: Implement replay helper**

Implement a private helper in `DayEntryService`:

```ts
function replayHistories(
  histories: DailyHistoryRecord[],
  editedNowIso: string,
): {
  histories: DailyHistoryRecord[];
  finalTotalYen: number;
};
```

Sort oldest first by `createdAt`, then `id`. Recalculate every row's `beforeTotalYen` and `afterTotalYen` while preserving `id`, `date`, `budgetPeriodId`, `operationType`, `createdAt`, and normalized memo.

- [ ] **Step 5: Wire D1 service port**

Extend `DayEntryServicePort` in `month-summary-service.ts` and implement equivalent D1 edit/delete behavior.

D1-specific requirements:

- Read period/date histories through the D1 repositories.
- Compute the replay in the service layer.
- Call `dayEntryWriter.writeHistoryReplay(...)` once to persist the history updates/deletes and final daily total atomically.
- Add a regression test that forces one writer statement to fail and verifies both history rows and `daily_totals` roll back.

- [ ] **Step 6: Run focused service tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/days.test.ts
```

Expected: replay tests pass.

## Task 5: Add History Row API Routes

**Files:**

- Modify: `src/lib/server/validation/day.ts`
- Create: `src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server.ts`
- Modify: `tests/integration/api/periods.test.ts`
- Modify: `tests/integration/api/months.test.ts`
- Modify as needed: `tests/integration/helpers/period-d1-fake.ts`

- [ ] **Step 1: Add route tests first**

In `tests/integration/api/periods.test.ts`, add tests for:

- `PATCH` edits a history row and returns fresh period summary plus histories.
- `DELETE` removes a history row and returns fresh period summary plus histories.
- mismatched `historyId` / period / date returns `404`.
- invalid amount returns `400`.
- deleting the last history row returns empty histories and a refreshed summary with no used amount for that day.

- [ ] **Step 2: Add validation helper**

Reuse `parseDayMutationInput(request)` for `PATCH` if the payload is exactly `{ inputYen, memo }`. If a separate name improves clarity, export:

```ts
export const parseHistoryMutationInput = parseDayMutationInput;
```

- [ ] **Step 3: Implement route**

Route shape:

```ts
export const PATCH: RequestHandler = async (event) => { ... };
export const DELETE: RequestHandler = async (event) => { ... };
```

Both handlers should:

1. Parse `periodId`, `date`, `historyId`.
2. Call `dependencies.services.dayEntryService.updateHistoryEntry` or `deleteHistoryEntry`.
3. Return:

```ts
json({
  summary,
  histories,
});
```

This lets the client refresh the calendar and history panel from one response.

- [ ] **Step 4: Add D1-path route/writer tests**

In `tests/integration/api/months.test.ts`, add coverage using `createD1ApiServices` and/or default route handlers with `createPeriodAwareD1Fake`:

- PATCH edits a row and replay-updates `daily_totals`.
- DELETE removes a row and replay-updates `daily_totals`.
- DELETE of the last row leaves no histories and no positive daily total.
- A forced writer failure rolls back the full replay batch.

Update `tests/integration/helpers/period-d1-fake.ts` to recognize the new Drizzle SQL for history update/delete and daily total replay.

- [ ] **Step 5: Keep existing GET history route unchanged**

Do not overload `GET /history`; it should continue returning `{ periodId, date, histories }`.

- [ ] **Step 6: Run route tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/periods.test.ts
pnpm test:integration -- tests/integration/api/months.test.ts
```

Expected: new route tests pass.

## Task 6: Update Day Entry Modal UI

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/DayEntryModal.svelte`
- Modify: `src/lib/components/HistoryPanel.svelte`

- [ ] **Step 1: Remove operation state from the page**

In `src/routes/+page.svelte`, remove:

```ts
let modalOperation = $state<"add" | "overwrite">("add");
```

Primary save should always call the add endpoint:

```ts
const endpoint = `/api/periods/${periodId}/days/${payload.date}/add`;
const method = "POST";
```

- [ ] **Step 2: Make preview calculations add-only**

Update `modalPreviewAfterYen` so it always means current used amount plus input amount:

```ts
const modalPreviewAfterYen = $derived(
  (selectedRow?.usedYen ?? 0) +
    (Number.parseInt(modalInputYen || "0", 10) || 0),
);
```

Remove any `modalOperation === "overwrite"` branches from preview and submit logic.

- [ ] **Step 3: Remove operation props from `DayEntryModal`**

Remove `operation` from props, bindables, `SavePayload`, and the operation fieldset.

- [ ] **Step 4: Update submit payloads**

Change `SavePayload` and `submitDayEntry` payloads to omit `operation`. The primary `save` callback should receive only:

```ts
{
  date: string;
  inputYen: number;
  memo: string;
}
```

- [ ] **Step 5: Add history mutation callbacks**

Add props to `HistoryPanel`:

```ts
updateHistory?: (payload: {
  historyId: string;
  inputYen: number;
  memo: string;
}) => void;
deleteHistory?: (payload: { historyId: string }) => void;
historyMutatingId?: string | null;
```

Pass callbacks from `DayEntryModal`, then from `+page.svelte`.

- [ ] **Step 6: Implement client effects**

In `+page.svelte`, add:

```ts
function updateHistoryEffect(payload): Effect.Effect<void, never> { ... }
function deleteHistoryEffect(payload): Effect.Effect<void, never> { ... }
```

Use:

```ts
PATCH /api/periods/:periodId/days/:date/history/:historyId
DELETE /api/periods/:periodId/days/:date/history/:historyId
```

On success, set `summary = body.summary`, `histories = body.histories`, and update `selectedRow`. If the response contains no histories, render the existing empty-history state.

- [ ] **Step 7: Build inline edit UI**

In each history row:

- show metadata and amount summary by default.
- show `編集` and `削除` buttons with icons from `@lucide/svelte` (`Pencil`, `Trash2`).
- when editing, replace the row body with amount input, memo textarea/input, `保存`, `キャンセル`.

Keep visible Japanese labels. If an icon-only control is introduced, add `aria-label`.

- [ ] **Step 8: Mobile styling**

At `max-width: 760px`:

- stack row header/details/actions.
- keep buttons at least `2.75rem` tall.
- avoid horizontal overflow on `390px` viewport.

- [ ] **Step 9: Check the page manually**

Run:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
```

Expected:

- No `上書き` text appears in the day-entry card.
- History rows show `編集` / `削除`.
- Inline edit can be opened and canceled.

## Task 7: Update E2E Coverage And Screenshots

**Files:**

- Modify: `tests/e2e/dashboard-day-entry.spec.ts`
- Keep generated artifacts under: `output/playwright/`

- [ ] **Step 1: Replace old overwrite E2E**

Update the current test named `"supports add and overwrite in day modal, and keeps values after reload"` so it no longer calls:

```ts
await page.getByLabel("上書き").check();
```

New flow:

1. Add `2000` with memo.
2. Reopen modal.
3. Click `編集` on that history row.
4. Change amount to `500`.
5. Save inline edit.
6. Assert calendar cell shows `500 円`.
7. Reload and assert it remains `500 円`.

- [ ] **Step 2: Add delete E2E**

Add two history rows, delete one, and assert:

- row disappears from history panel.
- calendar used amount updates.
- reload keeps updated amount.

- [ ] **Step 3: Add delete-last E2E**

Add one history row, delete it, and assert:

- the history panel shows `履歴はまだありません。`
- the calendar no longer shows a positive used amount for that date.
- reload keeps the empty/zero state.

- [ ] **Step 4: Add mobile smoke**

Use Playwright viewport `390x844`, open the modal with history, and assert:

- `編集` and `削除` buttons are visible.
- no `上書き` text is visible.
- inline edit controls are visible and usable.

- [ ] **Step 5: Capture after screenshots**

Run the same targeted screenshot approach used before and save:

```text
output/playwright/after-history-area-pc.png
output/playwright/after-history-area-mobile.png
```

Expected: screenshots match the approved mockup structure.

## Task 8: Full Verification

**Files:** no new files unless a check exposes a required fix.

- [ ] **Step 1: Format**

Run:

```bash
pnpm format
```

- [ ] **Step 2: Static checks**

Run:

```bash
pnpm format:check
pnpm lint
pnpm check
```

Expected: all pass.

- [ ] **Step 3: Focused tests**

Run:

```bash
pnpm test:integration -- tests/integration/api/days.test.ts
pnpm test:integration -- tests/integration/api/periods.test.ts
pnpm test:integration -- tests/integration/api/months.test.ts
pnpm test:e2e -- tests/e2e/dashboard-day-entry.spec.ts
```

Expected: all pass.

- [ ] **Step 4: Broad checks if focused tests pass**

Run:

```bash
pnpm test:unit
pnpm test:integration
pnpm build
```

Run `pnpm test:e2e` if the focused E2E did not cover an affected interaction or if layout changed beyond the day-entry card.

## Risks And Stop Conditions

- Stop and redesign if D1 cannot perform the history mutation and daily total update atomically with the existing Drizzle/D1 transaction path.
- Stop if replaying histories would require a schema migration; this plan intentionally avoids schema changes.
- Do not remove the existing overwrite API route in this task unless the user explicitly asks for API removal. Removing it would broaden compatibility risk beyond the requested UI change.
- Do not introduce runtime dependencies.
- Do not reintroduce month-first routes or date logic.
