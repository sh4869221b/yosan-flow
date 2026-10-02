# Fallow reviewed baseline (#352 / #353)

## Adoption context and reproduction

This is a reviewed inventory, **not a clean bill of health or a CI gate**. At #352, application
source was unchanged from [`aba727b`](https://github.com/sh4869221b/yosan-flow/commit/aba727b09bcb86e0262cccdf0e26d08fe2389097).
The original snapshot was taken on 2026-10-02 with #352's tooling configuration and
`tests/unit/fallow-config.test.ts`. Runtime/package-manager versions come from
`.node_version` and `package.json#packageManager`; dependencies come from the lockfile.
Fallow is pinned exactly to **3.30.0** (Node >=22), the newest release satisfying the
repository's three-day release-age policy at capture time. 3.31.0 was too recent;
no supply-chain exception was added. Renovate can update the exact npm dependency.

```bash
pnpm install --frozen-lockfile
pnpm fallow                       # human combined report; exits 1 with retained findings
pnpm fallow:dead-code             # currently exits 1: existing findings
pnpm fallow:dupes                 # currently exits 0: findings, no percentage gate
pnpm fallow:health                # currently exits 1: existing findings
```

The scripts never load these baselines automatically and never apply fixes. Keep
ESLint and svelte-check; their jobs answer different questions. The cleanup below belongs to
[#353](https://github.com/sh4869221b/yosan-flow/issues/353); CI enforcement belongs to
[#354](https://github.com/sh4869221b/yosan-flow/issues/354). No GitHub Actions workflow
or existing quality gate is changed here.

For machine-readable reports, synchronize first, then invoke the executable directly
so pnpm/SvelteKit output does not contaminate JSON. Keep stderr separate:

```bash
pnpm exec svelte-kit sync
mkdir -p .tmp-fallow
pnpm exec fallow dead-code --no-cache --format json --quiet --explain > .tmp-fallow/dead-code.json
pnpm exec fallow dupes --no-cache --format json --quiet --explain --no-fragments > .tmp-fallow/dupes.json
pnpm exec fallow health --no-cache --format json --quiet --explain > .tmp-fallow/health.json
pnpm exec fallow suppressions --format json --quiet
pnpm exec fallow list --entry-points --format json --quiet
pnpm exec fallow plugin-check --format json --quiet
```

Run each analysis even if the preceding command returns 1. In this pinned version,
dead-code/health and the human combined report return 1 for findings. The combined
JSON report returns 0 without a failure flag, as does dupes without a percentage
threshold. The format-dependent combined exit behavior is verified for 3.30.0. **Exit 0 alone never means no findings.**
Other exit statuses are tool/setup errors, not a baseline. Inspect `gate_outcomes`,
`workspace_diagnostics`, findings and stderr; never append `|| true` to claim a pass.

## Discovery and exception policy

- Built-in plugins discover SvelteKit `+page`, `+layout`, `+server`, hooks, matchers,
  `src/app.d.ts` and framework configuration. `$lib` and route `$types` are resolved
  after `svelte-kit sync`. Do not turn every file under `src/` or routes into an entry.
- `includeEntryExports: true` retains framework convention exports while reporting
  accidental extra exports. The local plugin records only three additional `default`
  export contracts: Drizzle config, Playwright config and Playwright global setup.
  `scripts/e2e-summary.ts` is invoked by Actions, and `scripts/e2e-timing.ts` by
  Playwright/its server command. Both are explicit support roots, not runtime roots.
- Vitest and Playwright discover tests. Their helpers, fixtures, injected handlers and
  test-only dependencies remain in the graph; `production` is false. No tests-wide
  ignore or complexity exemption is added. Built-in duplication discovery is retained
  (its tokenized corpus differs from health/dead-code); no custom test exclusion exists.
- `.svelte-kit`, `.wrangler`, `.tmp-*`, Playwright reports/results and the two exact
  Wrangler-generated declaration files are excluded. Default tool exclusions also
  cover dependencies, build output and coverage. The authored `src/app.d.ts` and D1
  type/schema files remain analyzed. Wrangler's generated `_worker` reference is not
  an unresolved-import defect in authored code; do not ignore all unresolved imports.
- `migrations/*.sql` remains the schema source of truth. SQL is outside Fallow's JS/TS
  analysis; a zero finding count says nothing about SQL validity or migration drift.
  `drizzle.config.ts` and the authored schema mirror stay in the graph.
- No rule is disabled/downgraded, no global member/export/dependency allowlist exists,
  and no baseline is silently used as a suppression. Boundary rules and custom rule
  packs are **not configured/not measured**; their reported zeroes are not proof of
  architectural/policy compliance. Existing architecture tests remain authoritative.
- Add an exception only after tracing its caller/contract. Prefer an exact file/export
  or a single-line, named-rule comment with a reason and regression evidence. Never
  delete an API, test port, dynamic property or required framework export solely from
  a syntactic report. Keep false positives distinct from accepted design repetition.
- Review exception validity and baseline identity whenever Fallow/config changes.
  Avoid whole-file suppressions, rule disabling, threshold inflation, automatic fixes,
  or baseline re-saving merely to make a failing result disappear.

Three fixture-based unit checks prove route/test reachability and unused sentinels,
only the declared tooling defaults are exempt, and exact generated declarations are
excluded while authored declarations still produce unresolved-import findings. These
check tooling behavior, **not repository finding counts**; they introduce no Fallow
cleanup gate through the unit-test job.

## Reviewed cleanup snapshot (#353, 2026-10-02)

The native baseline files now describe the focused cleanup built from main
[`0cacc8c`](https://github.com/sh4869221b/yosan-flow/commit/0cacc8cae8c149a7d67efaa9714af53578150264).
The historical tables below retain the #352 decisions so each change can be traced.
No tool version, discovery configuration, threshold, dependency, workflow or CI gate
was changed. No runtime API/error code, component prop, test-fake facade, mutation
ownership check, focus guard, or product wording was removed.

| Analysis                             | #352                                | After #353                                             |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------ |
| Dead code                            | 11                                  | 2 retained facade-contract findings                    |
| Duplication                          | 14 groups / 28 instances, 301 lines | 11 groups / 22 instances, 234 lines (1.177%)           |
| Actual cyclomatic/cognitive breaches | 14                                  | 1 retained H4 SQL-fake dispatcher                      |
| Health threshold findings            | 63                                  | 57: the H4 dispatcher plus 56 CRAP-only estimates      |
| Inline suppression markers           | 3, all lacking reasons              | 5 exact class-member markers, all reasoned, none stale |

Resolved work, mapped to the original inventory:

- All seven dead-code **fix** entries are resolved. Six declarations became local;
  only the uncalled `updatePeriodRangeInput` helper was deleted after another
  source/test reference search. The `PeriodRangeField` type remains used by inputs.
- D07 now reuses `daily-entry.assertValidDate` from the budget-period helpers.
  Both domain entry points retain identical invalid-date messages, native year
  handling, leap-date validity and next-day rollover. `domain-date-parity.test.ts`
  checks both callers, invalid period bounds and leap/year transitions.
- D11 shares only feedback colors and responsive action layout in
  `period-settings-form.css`. The two forms opt in via an exact class; direct-child
  selectors avoid changing nested range-picker styles. Existing desktop/mobile
  keyboard scenarios now also assert computed action layout and feedback colors.
- All 13 H1 cyclomatic/cognitive breaches are below the unchanged thresholds.
  Coherent Svelte blocks became local snippets, preserving DOM, scoped CSS, keyed
  boundaries, bindings and callbacks. Named form projections separate validation
  visibility and button availability from markup. History publication/retention,
  settings adoption, confirmation outcomes and focus-target choice were split at
  their existing responsibility boundaries. Queue/finalizer placement, revision
  checks, deferred focus validation and deletion settlement ordering are retained.
- D13's overlapping focus clone no longer meets the token threshold after extracting
  range validation's focus-target choice; its ownership guards remain. D10 remains
  visible. No additional contract cleanup was inferred from this incidental delta.

The two dynamic `code` false positives now have exact `unused-class-member`
markers. The three pre-existing day-entry markers remain necessary and gained
inline reasons. Actual error-instance tests pass these five classes through the
computed-property API mapper, without adding artificial static `.code` reads.
There were no obsolete markers to remove. No file-wide, duplication, health,
export or type suppression was added: retaining the reviewed raw exceptions avoids
hiding a future real complexity or contract change at the same location.

Remaining findings are intentional review work, not newly accepted defects:

- The two facade exports retain their **contract-required** classification. Their
  public/test contracts have not been narrowed merely to obtain zero dead code.
- Duplication is exactly the prior D01–D06, D08–D10, D12 and D14 groups. Their
  prior legitimate-exception/contract-required reasons still apply. No new group
  was admitted; opaque fingerprint suffixes shifted when three groups disappeared.
- Eight health identities disappeared (seven templates and settings `adopt`).
  Five original H1 locations now produce only CRAP estimates. Their separated
  responsibilities also introduce two named CRAP-only identities:
  `DashboardWorkspace.restoreCreatedFocus` (CC 17 / Cog 8, estimated CRAP 306)
  and `PeriodRangeForm.submissionFocusTarget` (7 / 7, estimated CRAP 56).
  Anonymous identities in those files still require location-level review.
  These are existing branches relocated without changing behavior, not measured
  coverage regressions. The original H2/H3/H4 reasoning remains in force. H1's
  actual complexity defect is resolved; CRAP-only evidence is **contract-required**.

`pnpm fallow` remains outside CI and currently exits 1 with retained findings in
human format. The same combined analysis with `--format json --quiet` exits 0,
reporting failed but unenforced gates. This corrects #352's overly broad combined
exit-0 description; do not infer cleanliness from that JSON status. Raw `dead-code`
and `health` still exit 1 for the retained findings; `dupes` exits 0.
All three explicit baseline comparisons succeed after review, with no new or stale
entries. This does not make a zero-finding or measured-coverage claim and does not
establish #354's enforcement policy. The raw findings and identities are checked
again after build so generated output cannot silently change the inventory.

Verification uses format, warning-strict lint/check, all unit/integration suites,
build, and the full hosted Playwright shards. The refactor also retains the existing
controller interruption/stale/offscreen race suites and browser keyboard, mobile,
confirmation, create-recovery, history-edit/delete and modal-return scenarios.
Local Wrangler startup is unavailable in the restricted execution environment
(`os.networkInterfaces` / `uv_interface_addresses` returns EPERM); hosted E2E is
required before reporting browser verification complete. See the cleanup PR's
exact-head checks for final outcomes. Server/API coverage is separately observable
with `pnpm test:coverage`, but it is not input to these static Fallow CRAP estimates.

## Historical #352 captured results

The following tables are the **pre-cleanup** inventory, not today's unresolved fix
list. The native JSON baselines reflect the reviewed #353 snapshot above.

| Analysis                    | Result                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Dead code                   | 11 findings: 6 unused exports, 3 unused type exports, 2 class members                    |
| Dependencies/imports/cycles | 0 dependency findings, unresolved imports, duplicate exports, cycles, stale suppressions |
| Duplication                 | 14 groups / 28 instances, 301 duplicated lines of 19,792, 1.521%                         |
| Health thresholds           | 63 functions: 14 exceed cyclomatic/cognitive limits; 49 are CRAP-only                    |
| Health coverage evidence    | Static estimates only; no measured coverage input                                        |
| Suppressions                | 3 existing single-line markers, 0 stale, 3 without inline reasons                        |

Defaults are retained: cyclomatic >20, cognitive >15, CRAP >=30, unit-size 60;
duplication mild mode, >=50 tokens / >=5 lines / >=2 occurrences, no percentage gate.
CRAP uses estimated coverage, not a measured test percentage or production usage.
The 207 `large_functions` and hotspot/target/file-score sections are supplemental
advisories, not additional threshold findings in the 63-function inventory. Their
provisional classification is **contract-required**: inspect the actual function
boundary before acting (test registration callbacks and Svelte template `line_count`
can cover large surrounding regions). No size/churn-based cleanup is authorized by
this baseline. Re-run `health` for those location-level advisories; none is suppressed.

Before the project config, the two generated Worker declarations alone added a
15,111-line clone pair and an unresolved `.svelte-kit/cloudflare/_worker` import.
Those are generated-file **false positives**, resolved by exact file exclusions.
Checking entry exports additionally exposed the test-fake type re-export below;
three config/setup defaults are **legitimate exceptions** modeled by the local plugin.

Classification meanings:

- **fix**: valid, bounded cleanup for #353; keep behavior and run affected tests
- **legitimate exception**: intentional contract/repetition with evidence; preserve it
- **false positive**: tool cannot see a real use; preserve it, add only narrow evidence-backed suppression if needed
- **contract-required**: retain until a contract or measured-evidence decision is made; not a deletion/refactor instruction

## Dead-code inventory (all 11)

| Location / symbol                                                                                        | Classification    | Evidence and next step                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/components/calendar/calendar-grid.ts:48` / `buildMonthLabel`                                    | fix               | Used inside `buildMonths` in the same file; remove only the unused export, retain the formatter and calendar-grid tests.                                                             |
| `src/lib/components/period-range-state.ts:59` / `updatePeriodRangeInput`                                 | fix               | No caller in source/tests; remove the unused helper after a fresh trace. Preserve the other range conversion/validation helpers and their tests.                                     |
| `src/lib/server/db/budget-period-repository.ts:3` / `LinkedPeriodBoundaryInvariantError`                 | contract-required | Unused facade re-export, but the error remains used via budget-period-types. Decide the repository facade contract before removing only the re-export; never delete the error class. |
| `src/lib/server/observability/schema.ts:3` / `OPERATIONS`                                                | fix               | Local runtime allowlist and exported Operation type still use it. Remove only export; preserve observability schema/allowlist tests.                                                 |
| `src/lib/server/services/period-update/period-update-types.ts:50` / `PERIOD_MULTIPLE_SUCCESSORS_ERROR`   | fix               | Used by the adjacent error class; remove only export, not its code/message or mapping.                                                                                               |
| `src/lib/server/validation/period-update.ts:125` / `parsePeriodBoundaryUpdateProposal`                   | fix               | Called by parsePeriodUpdateRequest in this file. Remove only export; preserve strict confirmation parsing tests.                                                                     |
| `src/lib/dashboard/period-summary-request-tracker.ts:3` / `PeriodSummaryRequest`                         | fix               | Locally used by the request tracker; remove only type export, preserving returned shapes and request ownership.                                                                      |
| `src/lib/dashboard/period-update-confirmation-state.svelte.ts:28` / `ConfirmationRecovery`               | fix               | Locally used recovery state and method signatures; remove only type export, preserving recovery identity and lifecycle.                                                              |
| `tests/integration/helpers/period-d1-fake.ts:3` / `PeriodAwareD1FakeOptions`                             | contract-required | Type re-export on the documented test-fake facade. Decide the fixture import contract before narrowing this entry; the factory options themselves remain required.                   |
| `src/lib/server/services/period-update/period-update-types.ts:61` / `PeriodMultipleSuccessorsError.code` | false positive    | Read dynamically through readStringProperty(error, "code") in src/lib/server/effect/result.ts; integration validation cases assert PERIOD_MULTIPLE_SUCCESSORS. Keep this field.      |
| `src/lib/server/services/period-update/period-update-types.ts:70` / `PeriodUpdateConflictError.code`     | false positive    | Same dynamic API mapping; conflict/persistence integration tests assert PERIOD_UPDATE_CONFLICT and status 409. Keep this field.                                                      |

The two dynamic `code` false positives remain visible in the raw report; #352 adds
no source suppressions. #353 should retain the API and attach narrow reasons/tests,
not accept Fallow's remove-member suggestion. `--trace file:export` and source/test
search were used for export review; syntactic reachability does not prove an
externally consumed contract is removable.

### Existing suppression inventory

All three are `fallow-ignore-next-line unused-class-member` on `code` in
`src/lib/server/services/day-entry-service.ts`: `PeriodNotFoundError` (67),
`DateOutOfPeriodError` (77), `HistoryNotFoundError` (87). Classification:
**legitimate exception** to syntactic member analysis. `effect/result.ts` reads
`code` by computed property and maps these to stable API responses;
`tests/unit/api-error-response.test.ts` and day-entry integration suites cover the
mapping/route behavior. None is stale in 3.30.0. They predate this PR and lack inline
reasons; #353 should add the dynamic-API rationale beside each exact marker. Do not
replace them with a global `code` allowlist, and do not delete the fields.

## Duplication inventory (all 14 groups)

Locations, rather than opaque fingerprints alone, identify each reviewed group.
Token similarity is not proof that two bodies have the same behavior.

| ID  | Locations                                                                                                                                                              | Classification       | Evidence and next step                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | `src/lib/server/db/daily-history-in-memory-repository.ts:46-53`<br>`src/lib/server/db/daily-history-in-memory-repository.ts:62-69`                                     | legitimate exception | Newest-first display versus oldest-first replay deliberately reverses both timestamp and insertion-index ordering. Preserve same-timestamp tests.                                             |
| D02 | `tests/integration/helpers/period-d1-fake-modules/daily-operation-history-sql.ts:37-47`<br>`tests/integration/helpers/period-d1-fake-modules/daily-total-sql.ts:28-38` | legitimate exception | Independent SQL fake dispatchers for history and totals enforce the same period/range predicate on different tables. Keep each SQL-shape/argument contract explicit.                          |
| D03 | `src/routes/api/periods/[periodId]/days/[date]/add/+server.ts:34-62`<br>`src/routes/api/periods/[periodId]/days/[date]/overwrite/+server.ts:34-62`                     | contract-required    | Add POST and overwrite PUT share response plumbing but distinct service methods and telemetry operation names. A shared handler needs explicit method/mutation/error/span parity tests first. |
| D04 | `tests/e2e/period-boundary-confirmation-adversarial-scenarios.ts:63-74`<br>`tests/e2e/period-boundary-confirmation-helpers.ts:178-187`                                 | legitimate exception | The adversarial case expects externally changed successor budget 91,000; assertUnchangedPair expects the original budget. Reusing it unchanged would weaken the race assertion.               |
| D05 | `tests/e2e/period-boundary-confirmation-adversarial-scenarios.ts:66-73`<br>`tests/e2e/period-boundary-confirmation-adversarial-scenarios.ts:184-191`                   | legitimate exception | Adversarial assertions intentionally differ in successor budget or overridden endDate. Preserve each scenario-specific persisted-state assertion.                                             |
| D06 | `tests/integration/api/period-boundary-update-validation-scenarios.ts:116-123`<br>`tests/integration/api/period-boundary-update-validation-scenarios.ts:195-202`       | legitimate exception | Separate stale-confirmation scenarios assert the same conflict response and unchanged rows after different invalidating inputs. Keep both scenarios independently readable.                   |
| D07 | `src/lib/server/domain/budget-period.ts:4-10`<br>`src/lib/server/domain/daily-entry.ts:4-10`                                                                           | fix                  | Two domain date validators parse the same calendar parts. Consolidate the complete validator only after invalid/leap-date and error-message parity tests; preserve domain callers.            |
| D08 | `src/lib/components/dashboard/PeriodBoundaryConfirmationDialog.svelte:96-105`<br>`src/lib/components/day-entry-modal.css:10-19`                                        | contract-required    | Shared modal visual treatment spans scoped Svelte CSS and global modal CSS. Decide a scoped shared style contract and verify desktop/mobile/focus surfaces before extraction.                 |
| D09 | `tests/e2e/period-boundary-confirmation-adversarial-scenarios.ts:98-105`<br>`tests/e2e/period-boundary-confirmation-adversarial-scenarios.ts:170-177`                  | legitimate exception | Each adversarial browser flow installs its response wait before its own mutation. Preserve wait-before-action ordering and distinct response/status assertions.                               |
| D10 | `src/lib/components/dashboard/BudgetPeriodForm.svelte:81-92`<br>`src/lib/components/dashboard/PeriodRangeForm.svelte:113-129`                                          | contract-required    | Focus restoration has different proposalPending and visibility guards. Establish a shared focus lifecycle contract before deduplicating; retain stale-intent and interrupted-flow E2E tests.  |
| D11 | `src/lib/components/dashboard/BudgetPeriodForm.svelte:237-252`<br>`src/lib/components/dashboard/PeriodRangeForm.svelte:353-368`                                        | fix                  | Matching alert/status colors and responsive action layout can share narrowly scoped form styles. Verify both forms at desktop/mobile widths without broad global selectors.                   |
| D12 | `src/routes/api/periods/[periodId]/days/[date]/add/+server.ts:27-34`<br>`src/routes/api/periods/[periodId]/days/[date]/overwrite/+server.ts:27-34`                     | contract-required    | Shared route input parsing belongs to distinct add/overwrite commands. Review together with the larger route clone, preserving handler factories and API error/telemetry behavior.            |
| D13 | `src/lib/components/dashboard/BudgetPeriodForm.svelte:71-81`<br>`src/lib/components/dashboard/PeriodRangeForm.svelte:102-115`                                          | contract-required    | Same focus-intent lifecycle as r11, with a range-confirmation pending guard. Review those two overlapping groups as one contract decision.                                                    |
| D14 | `tests/integration/api/period-boundary-update-validation-scenarios.ts:97-104`<br>`tests/integration/api/period-boundary-update-validation-scenarios.ts:200-207`        | legitimate exception | Repeated no-write assertions are the observable postcondition of different invalid/stale confirmation scenarios, not duplicate test cases.                                                    |

## Health threshold inventory (all 63 functions)

Reason codes keep the per-function inventory compact:

- **H1 / fix**: actual cyclomatic/cognitive threshold exceeded. Extract coherent units
  without dropping branches. For templates, preserve labels, selectors, responsive
  layout and focus; for controllers, preserve period/date/revision/session ownership,
  queued mutation ordering and Effect finalization. Run the affected unit race suites
  and browser workflows. CRAP accompanying H1 is still only an estimate.
- **H2 / contract-required**: CRAP-only finding in authored runtime code. Cyclomatic
  and cognitive values are within defaults. Obtain relevant measured branch coverage
  or establish missing behavior tests before calling this a refactor/coverage defect.
  Existing E2E or controller tests may exercise code the static estimate misses.
- **H3 / legitimate exception**: CRAP-only finding in a test's request dispatcher,
  row fixture, parser or scenario callback. These branches encode deliberately
  different test stimuli/assertions; no measured coverage of the test helper itself
  was supplied. Keep explicit scenario behavior, reassess if it becomes hard to maintain.
- **H4 / contract-required**: the D1 fake's mutation dispatcher has a real cognitive
  threshold finding, but mirrors SQL shapes, bind indexes, replay and no-history delete
  behavior. Specify parity/rollback assertions before splitting it; do not simplify away cases.

CC = cyclomatic, Cog = cognitive. All CRAP numbers below are **estimated**.

| Location                                                                                   | Function                  | CC / Cog / CRAP | Classification       | Reason |
| ------------------------------------------------------------------------------------------ | ------------------------- | --------------- | -------------------- | ------ |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:175`                                  | `<template>`              | 47 / 37 / —     | fix                  | H1     |
| `src/lib/dashboard/history-mutation-lifecycle.ts:75`                                       | `outcome`                 | 27 / 22 / 184.5 | fix                  | H1     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:151`                               | `<arrow>`                 | 23 / 12 / 552.0 | fix                  | H1     |
| `src/lib/components/HistoryPanel.svelte:265`                                               | `<template>`              | 22 / 21 / —     | fix                  | H1     |
| `src/lib/components/dashboard/BudgetPeriodForm.svelte:111`                                 | `<template>`              | 22 / 19 / —     | fix                  | H1     |
| `src/lib/components/day-entry/HistoryRow.svelte:263`                                       | `<template>`              | 19 / 30 / —     | fix                  | H1     |
| `src/lib/dashboard/day-entry-mutation-lifecycle.ts:72`                                     | `outcome`                 | 18 / 14 / 88.0  | contract-required    | H2     |
| `src/lib/dashboard/period-settings-state.svelte.ts:174`                                    | `adopt`                   | 18 / 16 / 88.0  | fix                  | H1     |
| `src/lib/components/HistoryPanel.svelte:198`                                               | `removeHistory`           | 17 / 17 / 306.0 | fix                  | H1     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:197`                               | `<template>`              | 17 / 26 / —     | fix                  | H1     |
| `tests/integration/helpers/period-d1-fake-modules/daily-total-sql.ts:49`                   | `applyDailyTotalMutation` | 17 / 18 / —     | contract-required    | H4     |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:84`                                   | `<arrow>`                 | 15 / 17 / 240.0 | fix                  | H1     |
| `src/lib/dashboard/period-controller-refresh-effect.ts:85`                                 | `<anonymous>`             | 15 / 10 / 63.6  | contract-required    | H2     |
| `src/lib/dashboard/period-controller-refresh-effect.ts:38`                                 | `<anonymous>`             | 14 / 15 / 56.3  | contract-required    | H2     |
| `tests/e2e/period-boundary-confirmation-helpers.ts:28`                                     | `parsePublicPeriod`       | 14 / 3 / 56.3   | legitimate exception | H3     |
| `tests/integration/helpers/period-d1-fake-modules/daily-operation-history-mutations.ts:99` | `tryApplyInsert`          | 14 / 14 / 56.3  | legitimate exception | H3     |
| `tests/unit/period-controller-operation-state.test.ts:80`                                  | `fetchMock`               | 14 / 14 / 56.3  | legitimate exception | H3     |
| `src/lib/dashboard/period-controller-confirm-effect.ts:77`                                 | `<anonymous>`             | 13 / 18 / 49.5  | fix                  | H1     |
| `src/lib/components/dashboard/BudgetPeriodForm.svelte:58`                                  | `<arrow>`                 | 12 / 14 / 156.0 | contract-required    | H2     |
| `src/lib/components/dashboard/CreatePeriodPanel.svelte:138`                                | `<template>`              | 12 / 21 / —     | fix                  | H1     |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:109`                                  | `<arrow>`                 | 12 / 7 / 156.0  | contract-required    | H2     |
| `src/lib/dashboard/period-controller-update-effect.ts:152`                                 | `<anonymous>`             | 12 / 12 / 43.1  | contract-required    | H2     |
| `src/lib/dashboard/period-summary-revision.ts:66`                                          | `release`                 | 12 / 12 / 43.1  | contract-required    | H2     |
| `tests/unit/dashboard-history-period-return.test.ts:68`                                    | `fetchMock`               | 12 / 11 / 43.1  | legitimate exception | H3     |
| `tests/unit/period-controller-summary-races.test.ts:211`                                   | `fetchMock`               | 12 / 12 / 43.1  | legitimate exception | H3     |
| `src/lib/components/dashboard/BudgetPeriodForm.svelte:78`                                  | `<arrow>`                 | 11 / 7 / 132.0  | contract-required    | H2     |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:139`                                  | `<arrow>`                 | 11 / 6 / 132.0  | contract-required    | H2     |
| `src/lib/dashboard/history-controller-state.svelte.ts:73`                                  | `<anonymous>`             | 11 / 9 / 37.1   | contract-required    | H2     |
| `src/lib/dashboard/period-update-api.ts:81`                                                | `parseSnapshot`           | 11 / 4 / 37.1   | contract-required    | H2     |
| `src/lib/dashboard/period-update-api.ts:184`                                               | `isPeriodSummary`         | 11 / 2 / 37.1   | contract-required    | H2     |
| `tests/integration/helpers/daily-operation-history-mutations.test.ts:23`                   | `historyRow`              | 11 / 10 / 37.1  | legitimate exception | H3     |
| `tests/unit/period-controller-selection-races.test.ts:382`                                 | `fetchMock`               | 11 / 9 / 37.1   | legitimate exception | H3     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:136`                               | `<arrow>`                 | 10 / 4 / 110.0  | contract-required    | H2     |
| `src/lib/dashboard/day-entry-summary-reconciliation.ts:31`                                 | `<anonymous>`             | 10 / 5 / 31.6   | contract-required    | H2     |
| `src/lib/dashboard/history-summary-reconciliation.ts:88`                                   | `<anonymous>`             | 10 / 7 / 31.6   | contract-required    | H2     |
| `src/lib/dashboard/period-controller-create-effect.ts:42`                                  | `<anonymous>`             | 10 / 10 / 31.6  | contract-required    | H2     |
| `src/lib/dashboard/period-controller-update-effect.ts:79`                                  | `<anonymous>`             | 10 / 11 / 31.6  | contract-required    | H2     |
| `src/lib/server/services/period-summary/period-summary-calculator.ts:66`                   | `<anonymous>`             | 10 / 10 / 31.6  | contract-required    | H2     |
| `tests/e2e/period-boundary-confirmation-recovery-scenarios.ts:14`                          | `<arrow>`                 | 10 / 9 / 31.6   | legitimate exception | H3     |
| `tests/unit/dashboard-history-mutation-races.test.ts:77`                                   | `fetchMock`               | 10 / 8 / 31.6   | legitimate exception | H3     |
| `tests/unit/day-entry-controller-history-mutation.test.ts:180`                             | `fetchMock`               | 10 / 8 / 31.6   | legitimate exception | H3     |
| `tests/unit/period-controller-confirmation.test.ts:35`                                     | `<arrow>`                 | 10 / 3 / 31.6   | legitimate exception | H3     |
| `tests/unit/period-controller-confirmation.test.ts:106`                                    | `fetchMock`               | 10 / 8 / 31.6   | legitimate exception | H3     |
| `tests/unit/period-controller-create-recovery.test.ts:254`                                 | `<arrow>`                 | 10 / 11 / 31.6  | legitimate exception | H3     |
| `tests/unit/period-controller-summary-races.test.ts:133`                                   | `fetchMock`               | 10 / 8 / 31.6   | legitimate exception | H3     |
| `src/lib/components/HistoryPanel.svelte:144`                                               | `saveEdit`                | 9 / 8 / 90.0    | contract-required    | H2     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:113`                               | `<arrow>`                 | 9 / 9 / 90.0    | contract-required    | H2     |
| `src/routes/+page.svelte:23`                                                               | `restoreDayEntryFocus`    | 9 / 6 / 90.0    | contract-required    | H2     |
| `src/lib/components/HistoryPanel.svelte:249`                                               | `retry`                   | 8 / 5 / 72.0    | contract-required    | H2     |
| `src/lib/components/calendar/PeriodCalendarMonth.svelte:53`                                | `<template>`              | 8 / 26 / —      | fix                  | H1     |
| `src/lib/components/HistoryPanel.svelte:173`                                               | `restoreDeletedFocus`     | 7 / 4 / 56.0    | contract-required    | H2     |
| `src/lib/components/PeriodCalendar.svelte:42`                                              | `<arrow>`                 | 7 / 6 / 56.0    | contract-required    | H2     |
| `src/lib/components/dashboard/CreatePeriodPanel.svelte:97`                                 | `submit`                  | 7 / 8 / 56.0    | contract-required    | H2     |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:159`                                  | `submit`                  | 7 / 5 / 56.0    | contract-required    | H2     |
| `src/lib/components/day-entry/HistoryRow.svelte:174`                                       | `restoreFailureFocus`     | 7 / 5 / 56.0    | contract-required    | H2     |
| `src/routes/api/__test/reset/+server.ts:44`                                                | `POST`                    | 7 / 4 / 56.0    | contract-required    | H2     |
| `src/lib/components/dashboard/BudgetPeriodForm.svelte:97`                                  | `submit`                  | 6 / 4 / 42.0    | contract-required    | H2     |
| `src/lib/components/day-entry/HistoryRow.svelte:195`                                       | `handleSaveEdit`          | 6 / 5 / 42.0    | contract-required    | H2     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:83`                                | `retrySummary`            | 5 / 2 / 30.0    | contract-required    | H2     |
| `src/lib/components/dashboard/DashboardWorkspace.svelte:94`                                | `requestCalendarDayEntry` | 5 / 2 / 30.0    | contract-required    | H2     |
| `src/lib/components/dashboard/PeriodRangeForm.svelte:134`                                  | `<arrow>`                 | 5 / 4 / 30.0    | contract-required    | H2     |
| `src/lib/components/day-entry/DayEntryForm.svelte:67`                                      | `handleSubmit`            | 5 / 4 / 30.0    | contract-required    | H2     |
| `src/lib/components/day-entry/HistoryRow.svelte:86`                                        | `<arrow>`                 | 5 / 2 / 30.0    | contract-required    | H2     |

No health rule, threshold or function is suppressed. The classification records a
review decision, not permission to delete code. In particular, H2/H4 stay visible
until evidence resolves them; they are not quietly assigned to #353's fix list.

## Native baseline files and review workflow

`dead-code.baseline.json`, `dupes.baseline.json`, and `health.baseline.json` are the
pinned tool's native outputs. They contain relative identifiers/counts only, not raw
source fragments, local filesystem paths, logs, or credentials. Health is saved in
identity mode, which is more precise than per-file counts but still cannot distinguish
same-named/anonymous functions in one file. Duplication identities can change after
source moves or analyzer upgrades. Neither format is a complete correctness proof.

To compare locally without overwriting the captured inventory:

```bash
pnpm exec svelte-kit sync
pnpm exec fallow dead-code --baseline tooling/fallow/dead-code.baseline.json
pnpm exec fallow dupes --baseline tooling/fallow/dupes.baseline.json
pnpm exec fallow health --baseline-mode identity --baseline tooling/fallow/health.baseline.json
```

These commands hide known identities **only for review of changes**. A clean comparison
is not a clean raw report and is not the future #354 enforcement policy. Always inspect
the full reports first. When a reviewed change resolves entries, remove them; do not rebaseline new
problems as a shortcut. Refresh only after reviewing every changed finding:

```bash
pnpm exec fallow dead-code --save-baseline tooling/fallow/dead-code.baseline.json
pnpm exec fallow dupes --save-baseline tooling/fallow/dupes.baseline.json
pnpm exec fallow health --baseline-mode identity --save-baseline tooling/fallow/health.baseline.json
pnpm exec prettier --write tooling/fallow/*.json
```

Run these individually because a successful analysis with findings can exit 1. Update
this document's source revision, date, counts and classifications with the same review.
Validate on a fresh install/sync and after build to ensure generated output does not
change the finding identities. Re-run the fixture tests when changing config/version.

Version-specific references: the installed `node_modules/fallow/schema.json`, CLI
`--help` and `fallow/types` are authoritative for this pin; the
[upstream configuration guide](https://fallow.tools/docs/configuration/overview/),
[dead-code reference](https://fallow.tools/docs/cli/dead-code/),
[health reference](https://fallow.tools/docs/cli/health/) and
[suppression guide](https://fallow.tools/docs/configuration/suppression/) describe the
workflow but may move ahead of the locked version.
