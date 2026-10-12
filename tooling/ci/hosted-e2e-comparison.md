# Hosted Nix/container E2E comparison trial

This draft experiment retains the existing CI and manual E2E Nix workflows. Only
`e2e-compare.yml` runs the two methods. Its push trigger is limited to the named
trial branch and implementation paths; documentation updates do not rerun the
experiment. The frozen branch retains the original application/lockfile, including
Wrangler, rather than silently adopting the later main dependency update. Ordinary
PR CI remains authoritative for the PR's synthetic merge checkout, and its results
are not used as paired benchmark measurements.

The minimum successful comparison is one run: four cold jobs followed by four warm
jobs on `ubuntu-24.04`, method × shard 1/2 or 2/2, one worker, all 143 tests. Both
phases check out the same push SHA; runtime versions, resolved lock, test inventory,
source fingerprint, runner ImageOS/ImageVersion/architecture are verified before
accepting the summary. Different runner images or incomplete reports invalidate a
direct comparison. Physical CPUs and network variability still differ; one sample
per condition is not a statistical speedup result.

Existing repository caches are left untouched. A cold job starts without this
experiment's tool/dependency cache, uploads a method/shard/source-specific snapshot,
and its warm counterpart verifies hashes and restores that exact snapshot on a new
runner. Snapshots contain only tool caches and the pnpm store, never application
builds or local D1. They are transported through isolated Actions artifacts, with
one-day retention and upload compression disabled because the payload is already
compressed. This protects other cache keys from benchmark cache pressure. It is
not a measurement of the production `actions/cache` transport.

Nix uses the original hash-pinned single-user/no-daemon installer and unchanged
cache.nixos.org signature/cache-only preparation. It preserves parallel browser
preparation/build and the explicit wait. Its tool/evaluation/dependency snapshots
use host zstd, analogous to Actions cache's compression family. Container uses the
existing pinned image and same-container build/verify/test path; image snapshots
retain the existing gzip representation, and dependencies use zstd. Compression
choices are reported; this trial does not add a second compression-arm matrix.

Stage timing includes installer, closure retrieval/evaluation/signature checks,
pnpm bootstrap and dependencies, inventory verification, browser/font/FFmpeg smoke,
application build, E2E, image pulls/build/load/save, snapshot serialization and
verification/extraction. Completed job/step timings also include artifact snapshot
upload/download and diagnostics. Preserve overlap rather than adding stage totals
into job wall-clock. Both methods rebuild independently after restoration, keeping
all existing prebuild SHA/job/cwd/Node/environment/output checks and local D1 guards.

The source identity contains the literal GitHub push SHA and lock hash. Summary
requires 82 expected tests on shard 1 and 61 on shard 2, with no failed/flaky/skipped
outcomes, before comparing all eight jobs. Ordinary CI, Quality aggregation,
seven-day JSON/HTML/Wrangler/font diagnostics, and non-E2E checks remain unchanged.
No cache key deletion, signing-key change, permission/security setting change,
merge, deployment or cloud binding change is part of this experiment.
