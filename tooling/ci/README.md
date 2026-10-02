# CI runner efficiency

Issue #472 reduces avoidable runner use, not the duration of an ordinary full CI.

## Documentation allowlist (decided before implementation)

Only `README.md`, `CONTRIBUTING.md`, `DESIGN.md`, `tooling/fallow/README.md`,
and Markdown files below `tooling/ci/` are documentation-only. These locations
hold human-readable project, contribution, architecture, and quality-gate guidance;
they are not served assets or executable configuration. Paths must be canonical
relative paths without empty, `.` or `..` components. This is deliberately not a
repository-wide `.md` rule. `AGENTS.md`, `static/**`, application/tests/migrations,
package/lock/tool versions, Wrangler, workflows/scripts, and baselines/configs are
outside the allowlist. Any mixed change runs both E2E shards.

Changing this list requires reviewing runtime consumption, updating the classifier
and its positive/negative tests, and a full CI run. Do not expand it to make CI pass.

## Classification and required checks

`Classify PR changes` fetches complete history. For pull requests it validates the
base/head commit IDs from the event, finds their unique merge base, and reads the
entire `git diff --name-status -z --find-renames` up to the event head. It never
looks only at the last commit, uses an API's truncated file list, or evaluates
filenames as shell commands. Rename source and destination are both checked;
non-document deletions and all type changes require E2E. Missing commits, shallow
history, ambiguous merge bases, empty diffs and malformed output fail the job.
The classifier publishes `docs_only=true` or `docs_only=false` only after success.
A `main` push always returns false, even for documentation changes.

Both E2E shards depend only on classification. Unless it **succeeds with exact
`true`**, E2E runs (except when the workflow is cancelled). `Quality checks`
requires classification success and an exact boolean string, every existing
non-E2E required job's success, and both individual E2E successes for `false` or
both intentional skips for `true`. Failure/cancellation/missing output does not
become success. The Quality job always evaluates, so an intentional skip does not
leave its required check pending.

The two E2E jobs retain the check names `E2E tests (shard 1/2)` and
`E2E tests (shard 2/2)`. Their shared YAML steps anchor keeps install/test/artifact
behavior identical. Explicit jobs are needed because GitHub evaluates a
[job condition before expanding its matrix](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif).
This gives two observable skipped checks with no E2E runner allocation, rather
than one skipped unexpanded matrix placeholder. YAML anchors are
[supported by Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#yaml-anchors-and-aliases).
The shard commands, independent runners/D1 stores, `workers: 1`,
`fullyParallel: false`, reset contract, retry setting, and test inventory are
unchanged. Neither shard cancels the other on failure.

The timing summary records the intentional docs-only skip without downloading
nonexistent artifacts. For other outcomes it retains the existing JSON/timing/job
summary path, including failure diagnostics. Missing reports on cancelled runs
are not successful test evidence. The summary is still visibility-only; required
E2E outcomes are checked directly by Quality. No token permissions are added to
existing jobs; the classifier only needs `contents: read`.

## Concurrency and measurements

The group contains the workflow name and `pr-<number>` for PR runs. Only PR events
use `cancel-in-progress: true`. Every non-PR run gets `run-<run_id>`, so even pending
main runs never share a group. Different PRs and workflows are isolated. A new
push supersedes the old run asynchronously: cancellation detection and shutdown
are GitHub scheduler/runner behavior, not an immediate-termination guarantee.

Record the head SHA, run/attempt/job IDs, job start/end times, first-job-to-Quality
and first-job-to-last-job wall clocks, sum of non-skipped job durations, and E2E
job durations. These are observed runner execution seconds, not invoice-rounded
billable minutes. Exclude queue time before the first job, but show scheduler gaps
inside the run rather than subtracting them. Use the same branch content and
runner/commands when comparing; don't claim a controlled wall-clock speedup from
historical runs. The extra classifier creates a new serial dependency for E2E;
report its cost on ordinary PRs separately from docs-only E2E seconds avoided.

For cancellation record when each new head was pushed, the last observed old-run
state, first observed cancellation, and old-job completion timestamps. GitHub does
not expose the scheduler's cancellation-request timestamp through the jobs API;
label polling bounds as observations, not that internal timestamp. Split observed
old-run runner time at the new push time; do not count overlap as saved time or
invent what the cancelled tests would have taken to finish.

## Reproduction and failure investigation

Run `pnpm exec vitest run tests/unit/ci-changes.test.ts tests/unit/fallow-ci-policy.test.ts`
for the real-Git fixtures, NUL parser controls and shell-executed aggregate truth
table. Then run the repository's complete local/CI checks. To reproduce a diff:

```bash
CI_EVENT_NAME=pull_request CI_BASE_SHA=<40-character-base> CI_HEAD_SHA=<40-character-head> \
  GITHUB_OUTPUT=/tmp/ci-output GITHUB_STEP_SUMMARY=/tmp/ci-summary \
  node scripts/ci-changes.ts
```

Use fresh output files. Inspect the classifier logs first on a classification
failure, then verify checkout depth, both immutable event commits and the unique
merge base. Do not override `docs_only` or weaken Quality to work around errors.
Review both rename paths. A normal E2E failure keeps the existing JSON, HTML and
Wrangler diagnostics and timing artifacts; inspect both shard checks. Cancelled
jobs can stop before uploading artifacts.

Before merge, use isolated clearly labelled QA draft PRs against the implementation
branch for docs-only/rename cases (the implementation PR itself contains workflow
and executable changes, so correctly cannot skip E2E). Use a baseline docs PR
against unchanged main for comparison. Exercise mixed changes with a docs-only
latest commit, classifier failure, a real failing Playwright assertion, and two
new pushes while an old run is in progress. Never merge fault-injection branches.
Record evidence and remaining limitations in this directory and the Draft PR.

## Rollback

Revert the implementation commit(s) as a reviewed PR and run the full CI. A
minimal conservative rollback removes the concurrency block and classifier job,
removes E2E `needs`/`if` gating, restores unconditional E2E success requirements in
Quality, and restores unconditional timing reporting. Keep both E2E shards and
all other existing gates. Remove classifier/tests/docs only when no workflow uses
them; update structural tests consistently. Do not change branch protection,
Build strategy, retries, test expectations, or migration/Fallow baselines.
