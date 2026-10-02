# Issue #472 hosted acceptance evidence

Measured 2026-10-02 UTC. Implementation: [Draft PR #473](https://github.com/sh4869221b/yosan-flow/pull/473).
Operating policy, allowlist reasons, reproduction and rollback: [README](README.md).

## Outcome and adoption judgment

The implementation reduces avoidable runner work. It does **not** make ordinary
CI faster. The equivalent one-file documentation probe ran both shards before
(245 runner-seconds), and skipped both afterwards (0 E2E runner-seconds, no
runner assigned). Total observed runner time was 512s before versus 271s after (241s less);
this includes other jobs and is distinct from the 245 E2E seconds avoided.
All other required checks and Quality succeeded. The two real
same-PR supersessions cancelled old runs; other PRs continued independently.

Ordinary-before PR #471 and its merged main have the identical source tree
`276146d6c2194ccf6b5cab52c4080f0c41ffa847`. The before docs probe adds only
`tooling/ci/probe.md`; the after docs probe adds the identical file to the
implementation tree. Node 24.21.0 / pnpm 12.8.1 / Fallow 3.30.0, ubuntu-latest, lockfile,
Build strategy, E2E commands and 112-test inventory are unchanged. The
implementation adds classifier/aggregate tests (443→493 local unit tests), a
classifier job, and explicit shared-step shard jobs. This is not a randomized
controlled A/B, and shared account runner contention caused scheduling gaps.

The before ordinary PR reached Quality in 131s. After ordinary/mixed observations
were 156s (initial implementation), 143s (docs-only latest commit with the full
implementation diff), and the nonallowlisted-rename control (150s): range 143–156s, median 150s across these
three after runs. Their runner totals range 504–566s (median 554s). Classifier
jobs cost 5–13 runner-seconds in those completed ordinary runs, and E2E first
started 7–16s after the first job. The initial observed +25s Quality difference
includes 13s of classifier job time plus scheduling and test variability; it is
not all causally attributable to classification. No percentage speedup is claimed.

Recommendation: keep this design for the stated goal of avoiding redundant
runner work, subject to the owner's review of the added ordinary-PR wait. Do not
adopt it as an ordinary-latency improvement. The pinned Node setup and full-history
verification are retained rather than using an unpinned runner runtime. One
docs-only event avoids 245 measured E2E seconds; initial observed total runner
cost rose 517→554 (+37s) on ordinary examples. Dividing 245/37 gives ~6.6 ordinary
runs per docs-only run as a **sample-only illustration**, not a causal break-even
estimate (different execution/scheduling variance and added tests affect totals).
The classifier's directly measured 5–13s is a smaller identifiable component.
Cancelled-work savings cannot be precisely inferred without running the obsolete
work to completion; only actual post-push execution is reported.

## Required behavior and negative controls

- Full PR diff: implementation commits remain in the diff after later docs-only
  commits; normal E2E still runs 112 tests. No latest-commit-only bypass.
- Docs #476: both named shard checks `skipped`, timestamps equal, runner IDs
  absent. Every non-E2E required gate and Quality `success`; summary explicitly
  records intentional skips after verifying both results.
- Rename #475: `DESIGN.md → tooling/ci/design-moved.md` permits skipping;
  subsequently `AGENTS.md → tooling/ci/agents-moved.md` forces both full shards.
  Both source and destination matter; moving a nonallowlisted file into the docs
  directory does not bypass E2E.
- Classifier fault #477: injected invalid base revision produces classifier
  failure and no output. Both full E2E shards succeed 112/112, but Quality fails
  at its classifier-success assertion. All other required gates succeed.
- Shard fault #478: a separate added assertion fails in real Playwright. Results
  are 58 expected+1 unexpected in shard 1, 54 expected in shard 2, zero flaky/skipped.
  Quality fails; sibling shard continues. The extra 113th test exists only in that
  unmerged probe. Existing retries were not raised (configuration has no retries).
  JSON/HTML/Wrangler diagnostics artifact 11208616840 and both timing artifacts
  11208297187/11208243605 were uploaded; timing summary succeeds and reports the
  failure honestly.
- Same-PR supersessions: both old runs conclude `cancelled`; Quality fails on
  cancelled required jobs, while visibility-only summaries report unavailable
  results rather than passing tests. The last new head then completes all checks.
- Different PRs: #477/#478 started before the first supersession and finished
  after it with their expected failure, not cancellation. The #475 nonallowlisted
  rename ran across the second supersession and succeeded. This proves real
  concurrent PR isolation.
- Unit/CLI controls: 62 focused tests cover the narrow allowlist, mixed changes,
  real Git merge-base/full-history/rename cases, rename/delete/type change,
  malformed/empty diff, missing/invalid/noncommit/shallow revisions, main-push
  false output, exact CLI output, arbitrary filename text, and aggregate
  failure/cancelled/skipped/missing/invalid-output handling. No Fallow/migration
  baselines or acceptance thresholds were relaxed.
- Main/other-workflow grouping is source-level verified: PR groups contain the
  workflow name and PR number; non-PR groups contain unique run IDs, and only PR
  events cancel in progress. Classifier push-event tests always return false.
  **A fresh main push using this unmerged implementation and simultaneous
  different-workflow cancellation isolation have not been exercised.** Existing
  main run 36959128335 is unchanged; it predates these probes and is not concurrent
  proof. Fresh-main observation is a post-merge check, not a reason to merge for QA.

## Job timing comparison

Seconds below exclude queue time before the first actual job. Quality/all-job
wall clocks retain any inter-job scheduling gaps. Runner seconds sum allocated
job start/end intervals, including summaries; they are not rounded billing units.
All runs use attempt 1. Sources link to the exact run; per-job timestamps follow.

| Case                                         | Run                                                                              | Head                                       | Quality result | Quality seconds | All-job wall seconds | Runner seconds | E2E runner seconds | Classifier seconds |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------ | -------------- | --------------: | -------------------: | -------------: | -----------------: | -----------------: |
| Before: ordinary PR #471                     | [36958473944](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944) | `1e634199e113aae4a9fa300dbe574e6a5140a72c` | success        |             131 |                  136 |            517 |                241 |                  0 |
| Before: docs-only PR #474                    | [36962845308](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308) | `c26d01a6ea382dadb62c3e48f418e8d7ed306c20` | success        |             131 |                  142 |            512 |                245 |                  0 |
| After: ordinary PR #473 initial              | [36962674602](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602) | `afab79ed087632cbc3f5bc58f9b2e272087bc092` | success        |             156 |                  163 |            554 |                258 |                 13 |
| After: docs-only PR #476                     | [36962861669](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669) | `639aa32aadd0e758ef2d09eb500ecc976a04480a` | success        |              83 |                   83 |            271 |                  0 |                  9 |
| After: allowed rename PR #475                | [36962847282](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282) | `12fed33df6fe1a6cf48087fefb97d080a12a3e80` | success        |              73 |                   73 |            278 |                  0 |                  7 |
| Negative: classifier PR #477                 | [36962861353](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353) | `0cd9d3923f8230924cb1f166a49508bea467d462` | failure        |             190 |                  232 |            528 |                256 |                  6 |
| Negative: shard PR #478                      | [36962870625](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625) | `e4f8fc591dc8c7e45ca392f8297c5cefbf7a7b96` | failure        |             210 |                  210 |            581 |                260 |                  6 |
| Superseded run 1 PR #473                     | [36962953227](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227) | `20c4487d7a1399613c81a89c3e644c24f43bfe52` | failure        |              71 |                   83 |            408 |                109 |                  6 |
| Superseded run 2 PR #473                     | [36963015157](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157) | `d6e1327ca04f405bed9c41abe99d7926aaa55480` | failure        |              96 |                  102 |            440 |                163 |                  5 |
| After: nonallowlisted rename PR #475         | [36963087447](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447) | `af4919face0de2454cb2f1902e1c2e07758bb812` | success        |             150 |                  162 |            566 |                261 |                  9 |
| After: mixed PR #473 docs-only latest commit | [36963149760](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760) | `56e9863703bbb1b7d45b17b22fb7b02c8612d1c1` | success        |             143 |                  149 |            504 |                222 |                  5 |

## Cancellation observations

Push times are ref-update request/acknowledgement bounds. The GitHub scheduler's
internal cancellation-request timestamp is not exposed, so the timestamp of the
runner's first "operation was canceled" notice is reported separately. Detection
is when an API poll first observed the terminal cancelled state, not when the
scheduler issued it. Totals are split at the push acknowledgement and are
rounded to milliseconds; the true update lies within the given bounds.

| Control | Old run/head                                                                                                                  | New head                                   | Push request → acknowledgement (UTC)                | First runner cancellation notice | Last old job completed | API detected cancelled   | Old runner seconds before / after acknowledgement |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- | -------------------------------- | ---------------------- | ------------------------ | ------------------------------------------------: |
| 1       | [36962953227](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227) / `20c4487d7a1399613c81a89c3e644c24f43bfe52` | `d6e1327ca04f405bed9c41abe99d7926aaa55480` | 2026-10-02T04:05:21.757Z → 2026-10-02T04:05:26.364Z | 2026-10-02T04:05:43.8424079Z     | 2026-10-02T04:06:06Z   | 2026-10-02T04:06:25.339Z |                                  321.820 / 86.180 |
| 2       | [36963015157](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157) / `d6e1327ca04f405bed9c41abe99d7926aaa55480` | `56e9863703bbb1b7d45b17b22fb7b02c8612d1c1` | 2026-10-02T04:07:09.871Z → 2026-10-02T04:07:16.108Z | 2026-10-02T04:07:33.7201327Z     | 2026-10-02T04:07:50Z   | 2026-10-02T04:07:56.056Z |                                  385.216 / 54.784 |

The observed notices arrived about 17.5s after acknowledgement; final old-job
completion was 39.6s and 33.9s after acknowledgement, including the always-run
summary and failed Quality jobs. Do not promise immediate shutdown. These old
runs used 408s and 440s total runner time respectively; the remaining obsolete
work that was avoided is unknown.

## Per-job evidence

All timestamps are UTC. Skipped E2E rows have no runner and zero execution time.

### Before: ordinary PR #471

Run [36958473944](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944), head `1e634199e113aae4a9fa300dbe574e6a5140a72c`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Build / 110686648036](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648036)                 | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:31Z |             38 |
| [Type check / 110686648170](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648170)            | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:20Z |             27 |
| [Integration tests / 110686648190](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648190)     | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:22Z |             29 |
| [Format and lint / 110686648205](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648205)       | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:37Z |             44 |
| [Unit tests / 110686648240](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648240)            | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:58Z |             65 |
| [Fallow / 110686648316](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648316)                | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:15Z |             22 |
| [E2E tests (shard 1/2) / 110686648345](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648345) | success | 2026-10-02T03:03:53Z | 2026-10-02T03:05:49Z |            116 |
| [E2E tests (shard 2/2) / 110686648353](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648353) | success | 2026-10-02T03:03:53Z | 2026-10-02T03:05:58Z |            125 |
| [Migration safety / 110686648514](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110686648514)      | success | 2026-10-02T03:03:53Z | 2026-10-02T03:04:31Z |             38 |
| [E2E timing summary / 110687149269](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110687149269)    | success | 2026-10-02T03:06:00Z | 2026-10-02T03:06:09Z |              9 |
| [Quality checks / 110687149345](https://github.com/sh4869221b/yosan-flow/actions/runs/36958473944/job/110687149345)        | success | 2026-10-02T03:06:00Z | 2026-10-02T03:06:04Z |              4 |

### Before: docs-only PR #474

Run [36962845308](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308), head `c26d01a6ea382dadb62c3e48f418e8d7ed306c20`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Fallow / 110700093716](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093716)                | success | 2026-10-02T04:03:17Z | 2026-10-02T04:03:43Z |             26 |
| [Build / 110700093870](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093870)                 | success | 2026-10-02T04:03:18Z | 2026-10-02T04:03:57Z |             39 |
| [E2E tests (shard 2/2) / 110700093878](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093878) | success | 2026-10-02T04:03:17Z | 2026-10-02T04:05:17Z |            120 |
| [Type check / 110700093879](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093879)            | success | 2026-10-02T04:03:17Z | 2026-10-02T04:03:42Z |             25 |
| [Format and lint / 110700093897](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093897)       | success | 2026-10-02T04:03:17Z | 2026-10-02T04:03:53Z |             36 |
| [Unit tests / 110700093920](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093920)            | success | 2026-10-02T04:03:17Z | 2026-10-02T04:04:13Z |             56 |
| [E2E tests (shard 1/2) / 110700093931](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093931) | success | 2026-10-02T04:03:17Z | 2026-10-02T04:05:22Z |            125 |
| [Integration tests / 110700093987](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700093987)     | success | 2026-10-02T04:03:17Z | 2026-10-02T04:03:43Z |             26 |
| [Migration safety / 110700094002](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700094002)      | success | 2026-10-02T04:03:17Z | 2026-10-02T04:03:59Z |             42 |
| [Quality checks / 110700582687](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700582687)        | success | 2026-10-02T04:05:25Z | 2026-10-02T04:05:28Z |              3 |
| [E2E timing summary / 110700582704](https://github.com/sh4869221b/yosan-flow/actions/runs/36962845308/job/110700582704)    | success | 2026-10-02T04:05:25Z | 2026-10-02T04:05:39Z |             14 |

### After: ordinary PR #473 initial

Run [36962674602](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602), head `afab79ed087632cbc3f5bc58f9b2e272087bc092`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Unit tests / 110699563594](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563594)            | success | 2026-10-02T04:00:56Z | 2026-10-02T04:01:53Z |             57 |
| [Migration safety / 110699563779](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563779)      | success | 2026-10-02T04:00:56Z | 2026-10-02T04:01:43Z |             47 |
| [Format and lint / 110699563858](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563858)       | success | 2026-10-02T04:00:57Z | 2026-10-02T04:01:42Z |             45 |
| [Integration tests / 110699563868](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563868)     | success | 2026-10-02T04:00:58Z | 2026-10-02T04:01:28Z |             30 |
| [Type check / 110699563878](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563878)            | success | 2026-10-02T04:00:59Z | 2026-10-02T04:01:31Z |             32 |
| [Build / 110699563893](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563893)                 | success | 2026-10-02T04:00:56Z | 2026-10-02T04:01:31Z |             35 |
| [Classify PR changes / 110699563917](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563917)   | success | 2026-10-02T04:00:57Z | 2026-10-02T04:01:10Z |             13 |
| [Fallow / 110699563918](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699563918)                | success | 2026-10-02T04:00:56Z | 2026-10-02T04:01:17Z |             21 |
| [E2E tests (shard 1/2) / 110699623818](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699623818) | success | 2026-10-02T04:01:12Z | 2026-10-02T04:03:25Z |            133 |
| [E2E tests (shard 2/2) / 110699623840](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110699623840) | success | 2026-10-02T04:01:12Z | 2026-10-02T04:03:17Z |            125 |
| [Quality checks / 110700132981](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110700132981)        | success | 2026-10-02T04:03:28Z | 2026-10-02T04:03:32Z |              4 |
| [E2E timing summary / 110700132987](https://github.com/sh4869221b/yosan-flow/actions/runs/36962674602/job/110700132987)    | success | 2026-10-02T04:03:27Z | 2026-10-02T04:03:39Z |             12 |

### After: docs-only PR #476

Run [36962861669](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669), head `639aa32aadd0e758ef2d09eb500ecc976a04480a`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Unit tests / 110700142052](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142052)            | success | 2026-10-02T04:03:33Z | 2026-10-02T04:04:15Z |             42 |
| [Fallow / 110700142072](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142072)                | success | 2026-10-02T04:03:46Z | 2026-10-02T04:04:06Z |             20 |
| [Integration tests / 110700142083](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142083)     | success | 2026-10-02T04:03:41Z | 2026-10-02T04:04:14Z |             33 |
| [Classify PR changes / 110700142107](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142107)   | success | 2026-10-02T04:03:55Z | 2026-10-02T04:04:04Z |              9 |
| [Format and lint / 110700142121](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142121)       | success | 2026-10-02T04:04:07Z | 2026-10-02T04:04:47Z |             40 |
| [Type check / 110700142127](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142127)            | success | 2026-10-02T04:04:05Z | 2026-10-02T04:04:34Z |             29 |
| [Migration safety / 110700142136](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142136)      | success | 2026-10-02T04:03:53Z | 2026-10-02T04:04:38Z |             45 |
| [Build / 110700142203](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700142203)                 | success | 2026-10-02T04:04:06Z | 2026-10-02T04:04:51Z |             45 |
| [E2E timing summary / 110700278871](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700278871)    | success | 2026-10-02T04:04:16Z | 2026-10-02T04:04:21Z |              5 |
| [E2E tests (shard 1/2) / 110700279399](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700279399) | skipped | 2026-10-02T04:04:04Z | 2026-10-02T04:04:04Z |              0 |
| [E2E tests (shard 2/2) / 110700279628](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700279628) | skipped | 2026-10-02T04:04:04Z | 2026-10-02T04:04:04Z |              0 |
| [Quality checks / 110700457915](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861669/job/110700457915)        | success | 2026-10-02T04:04:53Z | 2026-10-02T04:04:56Z |              3 |

### After: allowed rename PR #475

Run [36962847282](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282), head `12fed33df6fe1a6cf48087fefb97d080a12a3e80`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Format and lint / 110700099692](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099692)       | success | 2026-10-02T04:03:18Z | 2026-10-02T04:04:02Z |             44 |
| [Fallow / 110700099732](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099732)                | success | 2026-10-02T04:03:19Z | 2026-10-02T04:03:44Z |             25 |
| [Classify PR changes / 110700099739](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099739)   | success | 2026-10-02T04:03:19Z | 2026-10-02T04:03:26Z |              7 |
| [Type check / 110700099744](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099744)            | success | 2026-10-02T04:03:18Z | 2026-10-02T04:03:51Z |             33 |
| [Migration safety / 110700099765](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099765)      | success | 2026-10-02T04:03:19Z | 2026-10-02T04:03:58Z |             39 |
| [Unit tests / 110700099791](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099791)            | success | 2026-10-02T04:03:19Z | 2026-10-02T04:04:09Z |             50 |
| [Build / 110700099800](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099800)                 | success | 2026-10-02T04:03:19Z | 2026-10-02T04:04:00Z |             41 |
| [Integration tests / 110700099845](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700099845)     | success | 2026-10-02T04:03:19Z | 2026-10-02T04:03:46Z |             27 |
| [E2E timing summary / 110700138828](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700138828)    | success | 2026-10-02T04:03:28Z | 2026-10-02T04:03:37Z |              9 |
| [E2E tests (shard 2/2) / 110700139690](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700139690) | skipped | 2026-10-02T04:03:27Z | 2026-10-02T04:03:27Z |              0 |
| [E2E tests (shard 1/2) / 110700140015](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700140015) | skipped | 2026-10-02T04:03:27Z | 2026-10-02T04:03:27Z |              0 |
| [Quality checks / 110700300181](https://github.com/sh4869221b/yosan-flow/actions/runs/36962847282/job/110700300181)        | success | 2026-10-02T04:04:28Z | 2026-10-02T04:04:31Z |              3 |

### Negative: classifier PR #477

Run [36962861353](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353), head `0cd9d3923f8230924cb1f166a49508bea467d462`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Integration tests / 110700140870](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700140870)     | success | 2026-10-02T04:03:29Z | 2026-10-02T04:03:58Z |             29 |
| [Format and lint / 110700140982](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700140982)       | success | 2026-10-02T04:03:39Z | 2026-10-02T04:04:16Z |             37 |
| [Fallow / 110700140987](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700140987)                | success | 2026-10-02T04:03:45Z | 2026-10-02T04:04:03Z |             18 |
| [Classify PR changes / 110700141018](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700141018)   | failure | 2026-10-02T04:03:59Z | 2026-10-02T04:04:05Z |              6 |
| [Unit tests / 110700141032](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700141032)            | success | 2026-10-02T04:04:01Z | 2026-10-02T04:04:59Z |             58 |
| [Type check / 110700141053](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700141053)            | success | 2026-10-02T04:04:01Z | 2026-10-02T04:04:31Z |             30 |
| [Build / 110700141081](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700141081)                 | success | 2026-10-02T04:03:52Z | 2026-10-02T04:04:26Z |             34 |
| [Migration safety / 110700141090](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700141090)      | success | 2026-10-02T04:04:04Z | 2026-10-02T04:04:52Z |             48 |
| [E2E tests (shard 2/2) / 110700285136](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700285136) | success | 2026-10-02T04:04:18Z | 2026-10-02T04:06:34Z |            136 |
| [E2E tests (shard 1/2) / 110700285205](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700285205) | success | 2026-10-02T04:04:22Z | 2026-10-02T04:06:22Z |            120 |
| [E2E timing summary / 110700854331](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700854331)    | success | 2026-10-02T04:07:12Z | 2026-10-02T04:07:21Z |              9 |
| [Quality checks / 110700854392](https://github.com/sh4869221b/yosan-flow/actions/runs/36962861353/job/110700854392)        | failure | 2026-10-02T04:06:36Z | 2026-10-02T04:06:39Z |              3 |

### Negative: shard PR #478

Run [36962870625](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625), head `e4f8fc591dc8c7e45ca392f8297c5cefbf7a7b96`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Classify PR changes / 110700168735](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168735)   | success | 2026-10-02T04:03:44Z | 2026-10-02T04:03:50Z |              6 |
| [Integration tests / 110700168821](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168821)     | success | 2026-10-02T04:03:59Z | 2026-10-02T04:04:34Z |             35 |
| [Format and lint / 110700168833](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168833)       | success | 2026-10-02T04:03:46Z | 2026-10-02T04:04:32Z |             46 |
| [Unit tests / 110700168851](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168851)            | success | 2026-10-02T04:04:08Z | 2026-10-02T04:05:08Z |             60 |
| [Fallow / 110700168854](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168854)                | success | 2026-10-02T04:03:47Z | 2026-10-02T04:04:06Z |             19 |
| [Migration safety / 110700168878](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168878)      | success | 2026-10-02T04:04:08Z | 2026-10-02T04:04:54Z |             46 |
| [Type check / 110700168881](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700168881)            | success | 2026-10-02T04:04:00Z | 2026-10-02T04:04:32Z |             32 |
| [Build / 110700169007](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700169007)                 | success | 2026-10-02T04:04:11Z | 2026-10-02T04:04:43Z |             32 |
| [E2E tests (shard 1/2) / 110700227913](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700227913) | failure | 2026-10-02T04:04:15Z | 2026-10-02T04:06:33Z |            138 |
| [E2E tests (shard 2/2) / 110700227922](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700227922) | success | 2026-10-02T04:04:16Z | 2026-10-02T04:06:18Z |            122 |
| [E2E timing summary / 110700850667](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700850667)    | success | 2026-10-02T04:06:35Z | 2026-10-02T04:06:42Z |              7 |
| [Quality checks / 110700850724](https://github.com/sh4869221b/yosan-flow/actions/runs/36962870625/job/110700850724)        | failure | 2026-10-02T04:06:36Z | 2026-10-02T04:07:14Z |             38 |

### Superseded run 1 PR #473

Run [36962953227](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227), head `20c4487d7a1399613c81a89c3e644c24f43bfe52`.

| Job / ID                                                                                                                   | Result    | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------- | -------------------- | -------------: |
| [Type check / 110700422215](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422215)            | success   | 2026-10-02T04:04:43Z | 2026-10-02T04:05:05Z |             22 |
| [Migration safety / 110700422427](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422427)      | success   | 2026-10-02T04:04:43Z | 2026-10-02T04:05:26Z |             43 |
| [Build / 110700422431](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422431)                 | success   | 2026-10-02T04:04:43Z | 2026-10-02T04:05:29Z |             46 |
| [Unit tests / 110700422485](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422485)            | cancelled | 2026-10-02T04:04:44Z | 2026-10-02T04:05:47Z |             63 |
| [Classify PR changes / 110700422487](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422487)   | success   | 2026-10-02T04:04:44Z | 2026-10-02T04:04:50Z |              6 |
| [Format and lint / 110700422514](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422514)       | success   | 2026-10-02T04:04:43Z | 2026-10-02T04:05:28Z |             45 |
| [Integration tests / 110700422521](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422521)     | success   | 2026-10-02T04:04:45Z | 2026-10-02T04:05:14Z |             29 |
| [Fallow / 110700422534](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700422534)                | success   | 2026-10-02T04:04:43Z | 2026-10-02T04:05:07Z |             24 |
| [E2E tests (shard 1/2) / 110700456730](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700456730) | cancelled | 2026-10-02T04:04:52Z | 2026-10-02T04:05:46Z |             54 |
| [E2E tests (shard 2/2) / 110700456758](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700456758) | cancelled | 2026-10-02T04:04:52Z | 2026-10-02T04:05:47Z |             55 |
| [E2E timing summary / 110700675533](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700675533)    | success   | 2026-10-02T04:05:49Z | 2026-10-02T04:06:06Z |             17 |
| [Quality checks / 110700675686](https://github.com/sh4869221b/yosan-flow/actions/runs/36962953227/job/110700675686)        | failure   | 2026-10-02T04:05:50Z | 2026-10-02T04:05:54Z |              4 |

### Superseded run 2 PR #473

Run [36963015157](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157), head `d6e1327ca04f405bed9c41abe99d7926aaa55480`.

| Job / ID                                                                                                                   | Result    | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------- | -------------------- | -------------: |
| [Integration tests / 110700749286](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749286)     | success   | 2026-10-02T04:06:08Z | 2026-10-02T04:06:40Z |             32 |
| [Build / 110700749357](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749357)                 | success   | 2026-10-02T04:06:08Z | 2026-10-02T04:06:43Z |             35 |
| [Unit tests / 110700749432](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749432)            | success   | 2026-10-02T04:06:09Z | 2026-10-02T04:06:58Z |             49 |
| [Classify PR changes / 110700749441](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749441)   | success   | 2026-10-02T04:06:08Z | 2026-10-02T04:06:13Z |              5 |
| [Migration safety / 110700749443](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749443)      | success   | 2026-10-02T04:06:08Z | 2026-10-02T04:06:52Z |             44 |
| [Type check / 110700749484](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749484)            | success   | 2026-10-02T04:06:09Z | 2026-10-02T04:06:40Z |             31 |
| [Fallow / 110700749488](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749488)                | success   | 2026-10-02T04:06:09Z | 2026-10-02T04:06:35Z |             26 |
| [Format and lint / 110700749494](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700749494)       | success   | 2026-10-02T04:06:09Z | 2026-10-02T04:06:51Z |             42 |
| [E2E tests (shard 1/2) / 110700775194](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700775194) | cancelled | 2026-10-02T04:06:15Z | 2026-10-02T04:07:36Z |             81 |
| [E2E tests (shard 2/2) / 110700775290](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110700775290) | cancelled | 2026-10-02T04:06:16Z | 2026-10-02T04:07:38Z |             82 |
| [Quality checks / 110701097406](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110701097406)        | failure   | 2026-10-02T04:07:40Z | 2026-10-02T04:07:44Z |              4 |
| [E2E timing summary / 110701097451](https://github.com/sh4869221b/yosan-flow/actions/runs/36963015157/job/110701097451)    | success   | 2026-10-02T04:07:41Z | 2026-10-02T04:07:50Z |              9 |

### After: nonallowlisted rename PR #475

Run [36963087447](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447), head `af4919face0de2454cb2f1902e1c2e07758bb812`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Format and lint / 110700836958](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700836958)       | success | 2026-10-02T04:06:32Z | 2026-10-02T04:07:19Z |             47 |
| [Migration safety / 110700837065](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837065)      | success | 2026-10-02T04:06:32Z | 2026-10-02T04:07:23Z |             51 |
| [Fallow / 110700837094](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837094)                | success | 2026-10-02T04:06:32Z | 2026-10-02T04:06:57Z |             25 |
| [Build / 110700837102](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837102)                 | success | 2026-10-02T04:06:31Z | 2026-10-02T04:07:05Z |             34 |
| [Classify PR changes / 110700837105](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837105)   | success | 2026-10-02T04:06:31Z | 2026-10-02T04:06:40Z |              9 |
| [Unit tests / 110700837116](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837116)            | success | 2026-10-02T04:06:32Z | 2026-10-02T04:07:38Z |             66 |
| [Type check / 110700837151](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837151)            | success | 2026-10-02T04:06:31Z | 2026-10-02T04:07:01Z |             30 |
| [Integration tests / 110700837188](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700837188)     | success | 2026-10-02T04:06:31Z | 2026-10-02T04:06:58Z |             27 |
| [E2E tests (shard 1/2) / 110700879998](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700879998) | success | 2026-10-02T04:06:42Z | 2026-10-02T04:08:56Z |            134 |
| [E2E tests (shard 2/2) / 110700880026](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110700880026) | success | 2026-10-02T04:06:43Z | 2026-10-02T04:08:50Z |            127 |
| [Quality checks / 110701390757](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110701390757)        | success | 2026-10-02T04:08:59Z | 2026-10-02T04:09:01Z |              2 |
| [E2E timing summary / 110701390846](https://github.com/sh4869221b/yosan-flow/actions/runs/36963087447/job/110701390846)    | success | 2026-10-02T04:08:59Z | 2026-10-02T04:09:13Z |             14 |

### After: mixed PR #473 docs-only latest commit

Run [36963149760](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760), head `56e9863703bbb1b7d45b17b22fb7b02c8612d1c1`.

| Job / ID                                                                                                                   | Result  | Start                | End                  | Runner seconds |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- | -------------------- | -------------: |
| [Classify PR changes / 110701143164](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143164)   | success | 2026-10-02T04:07:53Z | 2026-10-02T04:07:58Z |              5 |
| [Unit tests / 110701143264](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143264)            | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:56Z |             63 |
| [Fallow / 110701143265](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143265)                | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:12Z |             19 |
| [Format and lint / 110701143276](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143276)       | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:36Z |             43 |
| [Type check / 110701143295](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143295)            | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:19Z |             26 |
| [Migration safety / 110701143351](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143351)      | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:41Z |             48 |
| [Build / 110701143412](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143412)                 | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:25Z |             32 |
| [Integration tests / 110701143449](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701143449)     | success | 2026-10-02T04:07:53Z | 2026-10-02T04:08:26Z |             33 |
| [E2E tests (shard 2/2) / 110701173113](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701173113) | success | 2026-10-02T04:08:00Z | 2026-10-02T04:10:10Z |            130 |
| [E2E tests (shard 1/2) / 110701173132](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701173132) | success | 2026-10-02T04:08:00Z | 2026-10-02T04:09:32Z |             92 |
| [E2E timing summary / 110701670418](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701670418)    | success | 2026-10-02T04:10:12Z | 2026-10-02T04:10:22Z |             10 |
| [Quality checks / 110701670498](https://github.com/sh4869221b/yosan-flow/actions/runs/36963149760/job/110701670498)        | success | 2026-10-02T04:10:13Z | 2026-10-02T04:10:16Z |              3 |

## Cleanup and final-head verification

QA Draft PRs #474–#478 are closed without merging. Their branches are retained
only for reproducible evidence; no fault-injection commits are ancestors of the
implementation branch. No production deployment, main write, branch-protection
change, or merge was performed.

This document records completed acceptance runs before its own final commit.
The implementation remains a Draft PR. Its exact final head and all-check result
are recorded in a subsequent verification comment on #473, avoiding a recursive
"update evidence → new head" loop. The remaining fresh-main/other-workflow real
observations above must not be marked completed based on these PR results.
