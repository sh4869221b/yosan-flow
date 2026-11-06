# E2E shard experiment

This draft compares 2, 3 and 4 shards without changing normal CI or its required
`Quality checks` gate. It starts from main `8d883d1` and includes PR #647's verified
font/dependency caching in every arm. It does not deploy or modify Cloudflare.

The dedicated workflow runs only on pushes of trial implementation files to
`codex/ci-shard-trial`. It is an experiment, not a proposed permanent extra CI
workload. Do not merge this workflow as the production sharding change.

## Protocol fixed before measurement

- Freeze the trial commit for three complete workflow attempts. Rerun the entire
  workflow, not individual failed jobs. Retain failed attempts and identify fixes
  separately rather than discarding inconvenient results.
- One seed job runs the unsharded `--list` in the same pinned container and creates
  an isolated dependency/font cache. Each of the nine E2E jobs must restore that
  exact cache and cannot update it. No production cache is deleted or overwritten.
- Run all three conditions concurrently after the seed. All use the same SHA,
  lock, Node, pnpm, browser, font and ordinary test commands, with cold Docker
  images. Each shard builds its own application and migrates its own fresh local
  D1 on a separate hosted runner. Keep one worker, serial suites, reset guards,
  expectations, diagnostics and zero retries.
- The aggregate rejects a failed/cancelled/skipped shard, missing reports, duplicate
  or missing tests, unexpected tests, retries, flaky/skipped/failed outcomes,
  differing runtime manifests, or a different source SHA. Every partition must
  equal the full unsharded test-ID/project inventory.
- Preserve all attempt artifacts for seven days, including per-stage timings,
  full JSON test results, CPU model, logical CPU count, memory and runner image.
  Report these variations; equal runner labels do not imply equal performance.
- After the first trial, create the draft PR and wait for its ordinary required
  CI before further trial attempts to avoid overlapping these two workloads.

## Interpretation

Report each condition's end-to-end E2E readiness from seed completion (including
scheduling), shard job envelope, start skew and summed E2E job runtime. Compare
the three-attempt medians and retain each observation. Sum job runtime separately;
it is neither elapsed time nor a billing amount. Seed/aggregate overhead is shared
experimental overhead and must not be attributed to one condition.

The trial measures E2E completion, not production CI `Quality checks` latency.
Readiness excludes the initial workflow queue and includes all shard uploads.
The same warmed dependency cache controls transfer state; this does not establish
cold-cache behavior. Concurrent arms and heterogeneous hosted runners limit the
precision of small differences. Do not claim statistical significance from three
attempts. A permanent configuration must keep all shards in the required gate and
update the ordinary timing summary and full-inventory verification together.

Prefer the fastest condition with all acceptance checks passing. Report the extra
runner runtime and the incremental benefit of 4 over 3 before recommending it.
Publish actual run links and results in the draft PR after completion.
