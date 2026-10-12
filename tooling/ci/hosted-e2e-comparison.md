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

## Hosted result: 2026-10-12 UTC

**両方式・cold/warm・２ shard が成功しました。この１試行の総 job 時間は Nix の方が短く、速度改善だけを目的に案1へ置き換えることは推奨しません。** ただし CPU model と圧縮方式・artifact transport の差を含むため、Nix が一般に速いという結論ではありません。

- Draft PR: [#527](https://github.com/sh4869221b/yosan-flow/pull/527)。merge / deploy は未実施。
- Successful paired run: [38192740491, attempt 1](https://github.com/sh4869221b/yosan-flow/actions/runs/38192740491)。
- Frozen benchmark SHA: `9afe86ba6290e6b3385f6d4e484dbeec248d30a5`。
- Node `24.21.0`、pnpm `12.10.1`、installed test / Playwright / core `1.63.0`、Wrangler `4.148.0`。lock SHA-256 `dea3efb0dfe99baf7793dcb8c0055a843f532298359385f7f9307a5ecf1e7a52`。
- All eight jobs: `ImageOS=ubuntu24`, `ImageVersion=20261004.327.1`, `RUNNER_ARCH=X64`。各１ worker、143件（82＋61）、４条件で計572件成功。failed / flaky / skipped はすべてゼロ。
- ８つの actual JSON report の `config.workers=1`、prebuild identity の SHA / run ID / attempt / Node / cwd を確認。各 method の build と verify/test は同じ path。同じ shard の container cold image ID は warm で正確に再使用。
- [普通の PR CI 38192742918](https://github.com/sh4869221b/yosan-flow/actions/runs/38192742918) も Quality / E2E summary / 全 required jobs 成功。ただしこれは現在 main と synthetic merge した別 checkout・Wrangler 依存であり、比較数値には使用しません。

### Job と主要 stage（秒）

| Phase | Method    | Shard | Job | Dependencies | App build | Browser smoke | Playwright | Tests |
| ----- | --------- | ----- | --: | -----------: | --------: | ------------: | ---------: | ----: |
| cold  | nix       | 1/2   | 159 |         4.46 |     15.55 |          0.89 |      88.21 |    82 |
| cold  | nix       | 2/2   | 107 |         4.26 |      9.79 |          0.73 |      42.19 |    61 |
| cold  | container | 1/2   | 312 |         5.45 |     15.09 |          0.87 |      90.80 |    82 |
| cold  | container | 2/2   | 259 |         5.09 |     14.59 |          0.93 |      54.87 |    61 |
| warm  | nix       | 1/2   | 163 |         2.62 |     15.80 |          1.06 |      93.57 |    82 |
| warm  | nix       | 2/2   | 122 |         2.70 |     15.22 |          0.96 |      55.93 |    61 |
| warm  | container | 1/2   | 173 |         3.87 |     14.94 |          0.94 |      91.70 |    82 |
| warm  | container | 2/2   | 141 |         2.93 |     11.67 |          0.67 |      52.99 |    61 |

Job は completed_at−started_at（queue と summary job は除外）。checkout、orchestration Node、取得・準備、fresh build、D1/Wrangler startup、tests、snapshot 保存・転送、timing upload と post steps を含みます。stage は shell millisecond timestamp、artifact upload/download の step 時間は GitHub API の秒精度です。build / browser 準備は Nix で並行するので、stage の単純合計を job 時間にしません。

### 取得、署名確認、保存・復元の内訳

| 操作                                                  | Nix shard 1 / 2 | Container shard 1 / 2              |
| ----------------------------------------------------- | --------------- | ---------------------------------- |
| Cold installer（取得/hash/extract/profile込み）       | 2.36 / 2.07     | common host Node と image 側に分離 |
| Cold Nixpkgs evaluate/source retrieval                | 12.55 / 19.08   | —                                  |
| Cold tools fetch                                      | 1.39 / 1.42     | —                                  |
| Cold tools signature/content verification             | 0.67 / 0.45     | —                                  |
| Cold Playwright base pull                             | —               | 26.13 / 25.47                      |
| Cold Node base pull                                   | —               | 8.93 / 8.38                        |
| Cold derived image build（APT fonts込み）             | —               | 13.83 / 8.21                       |
| Cold browser/font closure fetch                       | 2.33 / 2.29     | base imageに含む                   |
| Cold browser signature/content verification           | 0.57 / 0.31     | OCI publisher signatureは未検証    |
| Cold image save + gzip                                | —               | 124.99 / 124.09                    |
| Cold snapshot serialize/hash（pnpm含む）              | 7.66 / 4.78     | 3.97 / 3.92（imageのgzipは上行）   |
| Cold snapshot upload                                  | 6 / 4           | 14 / 8                             |
| Warm snapshot download                                | 18 / 22         | 11 / 11                            |
| Warm snapshot verify/extract                          | 8.82 / 8.31     | 2.79 / 2.03（Docker loadは下行）   |
| Warm image load                                       | —               | 34.07 / 47.55                      |
| Warm installer reuse check                            | 0.035 / 0.049   | —                                  |
| Warm tools evaluate + fetch + verify + pnpm configure | 2.99 / 2.59     | pnpm configure 0.86 / 0.96         |
| Warm browser fetch + verify + smoke                   | 1.69 / 1.57     | smoke 0.94 / 0.67                  |

Container base / Node pulls は並行。cold は experiment tool/dependency snapshot なしという意味で、registry/CDN と runner の preinstalled public layers は消去・制御していません。Nix installer の small download だけと container 全取得を比較して勝敗にせず、job 全体を使っています。Warm は各 cold job の exact own snapshot を新しい runner に復元し、app と使い捨て D1 は再生成しました。

Snapshot payload（decimal MB、各 shard おおむね同じ）:

| Payload                    |                                 Nix |                     Container |
| -------------------------- | ----------------------------------: | ----------------------------: |
| Tool snapshot              | 338.71 MB zstd + evaluation 0.04 MB | image 1055.55–1055.57 MB gzip |
| pnpm snapshot              |                      160.19 MB zstd |         160.19–160.20 MB zstd |
| Total compressed payload   |                         約498.94 MB |                  約1215.74 MB |
| Nix raw store / evaluation |                1024.31 MB / 0.16 MB |                             — |
| Raw pnpm store             |                         約553.36 MB |                   約553.37 MB |

これは isolated artifact snapshot の圧縮済み payload と disk data の測定であり、通常 Actions cache の保存・転送速度の測定ではありません。image gzipとNix zstdの格式差を残した既存設計の比較です。container の圧縮なし／zstd という別 arm は実行していません。大きな image、gzip CPU 約124秒と Docker load 34–48秒が今回の具体的な追加負担です。

### Runner variation と比較の限界

| Phase / method / shard | CPU model                                     |
| ---------------------- | --------------------------------------------- |
| cold / nix / 1         | Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz |
| cold / nix / 2         | AMD EPYC 9V45 96-Core Processor               |
| cold / container / 1   | AMD EPYC 7763 64-Core Processor               |
| cold / container / 2   | AMD EPYC 7763 64-Core Processor               |
| warm / nix / 1         | AMD EPYC 7763 64-Core Processor               |
| warm / nix / 2         | AMD EPYC 7763 64-Core Processor               |
| warm / container / 1   | AMD EPYC 7763 64-Core Processor               |
| warm / container / 2   | AMD EPYC 9V74 80-Core Processor               |

同じ runner OS/image/architecture と VM class でも CPU model は同一ではありません。特に cold Nix shard 2 は AMD EPYC 9V45、container shard 2 は EPYC 7763 です。Nix warm の job が cold より短くならない例もあり、CPU・network・snapshot transfer を含む単発値を cache 自体の速度改善と断定しません。各条件１回の観測で、統計的な中央値・汎用的な speedup・CachyOS 上の性能は未確認です。source、lock、versions、143 tests、workers は同一ですが、browser/font/Node の library closure は各方式の設計そのものとして異なります。

Nix は既存の background preparation/build を Bash の concurrent child と両方の mandatory wait で維持。container は既存の serial smoke/build と additional FFmpeg real video smoke を維持しており、同じ最低限の smoke 内容だけに減らした比較ではありません。

### 再現性・更新待ち・保守・CachyOS の判断

既存 Nix の `require-sigs=true`, recursive `--sigs-needed 1`, builders empty / max-jobs 0 と original installer hash を変えず、cold/warm 双方で成功しました。snapshot archive の hash確認は transport integrity の追加で、Nix の署名確認を置き換えていません。Container は official MCR/Node の digest と frozen npm lock、Ubuntu APT signatures で固定しますが、OCI publisher signature / attestation は検証していません。signature authentication と content identity は同じ保証ではありません。

Nixpkgs と resolved Playwright をそろえる更新待ちは引き続き保守課題です。container は resolved lock と matching MCR tag/digest を取得前に確認しやすい一方、matching release、Node digest、APT/derived-image の review は必要です。どちらの新版本の publication が常に先かという latency は測っていません。

Normal development / non-E2E CI は変更なし。現在の production code（blank/comment込み、docs/tests/generated locks/benchmark除外）は Nix 294行、instrumented container 319行、共通pnpm 113行。比較専用 collector / validation / snapshots は別の397行で、試験 workflow と tests も別です。repo は rollback 用に両候補を残しており、単にコード量が減る置換ではありません。

CachyOS では Ubuntu userland 全体を container に閉じる案の利点は残ります。Nix の Node/browser/font closure は固定されますが npm native pnpm/workerd は host loader/libc に依存する部分があります。今回の実測は Ubuntu hosted のみで、CachyOS、Podman/rootless Docker、kernel/security設定別の適合は検証していません。

**推奨: 既存 Nix を通常 E2E CI に残す。案1は、CachyOSでのE2E隔離やPlaywright/Nixpkgs更新整合の運用上の問題を解決する候補としてdraftで保持する。** 速度目的で進めるなら、次は明確な理由がある別試験として image 配布／cache serialization を見直す必要があります。今回以上の CI を自動で大量に追加していません。merge / deploy はしていません。

### 実施履歴と証拠

- `c90a286` の [run 38192609149](https://github.com/sh4869221b/yosan-flow/actions/runs/38192609149) は conditional native wait step が workflow validator に拒否され、benchmark jobはゼロ。失敗を記録し、Bashで両 child を待つ構成へ修正しました。
- 対応する旧普通CI `38192613310` は同一PRの新pushによる既存 concurrency policy でcancelled。旧結果を新結果と混ぜていません。
- `9afe86b` の valid comparison は１run・attempt 1、８jobsのみ。全件成功、summary validatorも成功。failed/flaky/skippedの除外や rerun はありません。
- frozen commit の normal CI `38192742918` も全 required jobs と timing summary 成功。最終結果文書の追加は implementation paths に触れないため benchmarkを再起動しません。
- timings/identities/actual report/summaryの artifact は７日、tool/dependency snapshotsは１日。source/version/image validation、actual worker数、cold→warmの image ID 一致を確認済みです。
- Evidenceはworkspace `.tmp-hosted-results/{cold,warm}-{nix,container}-{1,2}/`, `summary/`, `verified-stage-metrics.json`, `provenance/`。artifact ZIPのGitHub SHA-256 digestも照合済み。
- local gh のAzure redirect取得はproxyで拒否されましたが、接続済みGitHubのread-only artifact downloaderでZIPを取得し、既存proxy/TLSを維持したplatform file downloadで回収できました。権限・network設定を変更していません。
