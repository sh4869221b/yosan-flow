# 案1: Container E2E 試験結果

2026-10-12 UTC、保存済みクラウド環境で実装・実行したローカル試験です。push、PR 作成・編集、マージ、デプロイ、クラウド設定変更は実施していません。

## 固定した条件

- 元の main / application baseline: `93e4100a6f4cd245bc50cd2a0f2f560d352d16ec`。開始時の `git fetch origin main` で確認しました。その後の Wrangler 更新は取り込んでいません。
- 比較用 implementation commit: `5f45253a6e326524389e227645b61074338fad54`。この結果文書を追加する前のコミットです。４回とも同じ SHA を prebuild identity で検証しました。
- branch: `codex/experiment-e2e-container-isolated`、独立 worktree: `/workspace/yosan-flow-container-test`。元の `/workspace/yosan-flow` は `work` ブランチ、元 SHA、クリーンなままです。
- Node `24.21.0`、pnpm `12.10.1`、resolved Playwright `1.63.0`、resolved Wrangler `4.148.0`。定義は `.node_version` / `package.json` / `pnpm-lock.yaml` を再利用し、依存 lock は変更していません。
- lock SHA-256: `dea3efb0dfe99baf7793dcb8c0055a843f532298359385f7f9307a5ecf1e7a52`。
- linux/amd64、Docker Engine `28.4.0`、storage driver `vfs`、約32GBの作業ディスク。２ shard を逐次実行し、各１ worker。
- build / verify / migrations / Wrangler / Playwright は各回の同一コンテナー内、同じ `/work/yosan-flow`。既存の CI prebuild guard を変更せず使用しました。
- ローカルで `CI=true` と GitHub Actions identity を模擬しました。hosted Actions の実行ではありません。
- ４回とも同一 image ID: `sha256:29f47beef0cbd1058871efbc214698f71712cda5062239bddb7601deabd7e252`。タグ・上流 digest・配布元・更新手順・保証の違いは [設計](container-e2e.md) と `container/image.json` にあります。

## 成功した E2E と計測

**初回も warm も合計143件（82 + 61）が成功。失敗、flaky、skip は４回ともゼロです。** 日本語フォント / ブラウザー / FFmpeg 動画 smoke、prebuild identity と output digest の検証、D1 migration と全３ table の reset 後ゼロ件確認も成功しました。

| 条件                    | shard | 全体 秒 | 依存導入 秒 | app build 秒 | Playwright 秒 | 成功件数 |
| ----------------------- | ----- | ------: | ----------: | -----------: | ------------: | -------: |
| 初回: 依存 store 空     | 1/2   |   292.1 |        50.9 |         12.4 |          82.4 |       82 |
| 初回: 依存 store 空     | 2/2   |   249.1 |        45.7 |         11.9 |          48.9 |       61 |
| warm: 同じ store 再利用 | 1/2   |   175.4 |        46.0 |         12.7 |          79.8 |       82 |
| warm: 同じ store 再利用 | 2/2   |   132.1 |        40.8 |         12.0 |          49.1 |       61 |

全体は外側の runner 呼出しから終了までで、Docker 起動終了、イメージ cache archive の保存／読み込み、pnpm bootstrap、依存導入、smoke、build、D1 startup、全テストを含みます。初回２回は archive を空にして成功後に保存し、warm ２回は archive を読み込みました。Playwright と startup/build の指標は重なるので合算しません。startup は約18.3〜19.4秒でした。
圧縮 archive は `1055558296` bytes（約1.06GB）、derived image は約2.73GB。初回の gzip 保存には２分以上かかりました。依存 cache があっても proxy 越しの supply-chain policy 確認に約40〜46秒かかり、archive restore/save と一緒に評価する必要があります。

**完全な cold image acquisition は未計測です。** MCR / Node image の初回取得と Dockerfile build は環境・フォント問題の調査中に済ませてあり、上表の前に実施しています。上表の全体時間に、その未計測の取得・build 時間を後から加えていません。各初回は「依存 store が空、derived image は取得済み」という条件です。

Nix はこの環境に存在せず、同じ SHA・依存・runner での Nix baseline は測れていません。historical CI / 異なる Wrangler の main / 準備に失敗した PR を比較対象にしていません。Nix より速いとは主張できません。hosted runner の並列２ shard、Actions cache 転送・post-job 保存、artifact upload、Quality job の実行時間も未計測です。各条件１回ずつで、統計的な性能結論を出す試験ではありません。

## その他の検証

- project 全体の Prettier check、warning-strict ESLint、Svelte/TypeScript check: 成功。型検査は errors 0 / warnings 0。
- Fallow dead-code / dupes / health: 新規 finding なし、既存 baseline 全件一致。新しい CLI entry の正規登録のみ行い、baseline / ignore / threshold は変更していません。
- unit + integration: 93 files / 692 tests。初回は691成功、SQLite CLI が PATH にない既存 integration test が１件失敗。既存環境の SQLite を PATH に指定して該当 file の３件を再実行し、すべて成功しました。コード変更で回避していません。
- Drizzle metadata check: 成功。migration safety: 5 files / 40 tests 成功。empty / legacy の使い捨て local D1、migration ledger とデータ保持の実検証を含みます。
- workflow YAML parse: 成功。２ shard、manual fail-fast false、Quality needs、７日 diagnostics / hidden files を確認。CI の E2E shard-1 block 以外は元コミットと text 完全一致（shard 2 は既存 anchor を再利用）。
- image-lock 不一致と未対応 lock 形式の拒否を、独立した一時 fixture で実行確認。既存 prebuild guard / single-worker / local D1 contract の関連 unit 65件も成功。
- 通常の local build path も開発確認の shard 1 / 82件で成功。その追加確認は上表の４回の比較に含めていません。

## 実行コマンドと証拠

実行した主要コマンド（Node は既存環境の `.node_version` に一致する binary、pnpm は既存 `preparePnpm` による lock-integrity 検証済み binary）:

```bash
git fetch origin main
git worktree add -b codex/experiment-e2e-container-isolated /workspace/yosan-flow-container-test HEAD
docker version
docker manifest inspect mcr.microsoft.com/playwright:v1.63.0-noble
docker manifest inspect node:24.21.0-bookworm-slim
bash -n scripts/e2e-container.sh scripts/e2e-container-inner.sh
node scripts/e2e-container-config.ts
NODE_USE_ENV_PROXY=1 bash scripts/e2e-container.sh 1
python3 /tmp/yosan-container-benchmark.py
node_modules/.bin/prettier --check .
node_modules/.bin/eslint . --max-warnings=0
node_modules/.bin/svelte-kit sync
node_modules/.bin/svelte-check --tsconfig ./tsconfig.json --fail-on-warnings
node scripts/fallow-ci.ts
node node_modules/vitest/vitest.mjs run tests/unit tests/integration
node node_modules/vitest/vitest.mjs run tests/integration/api/period-boundary-generated-sql.test.ts
node_modules/.bin/drizzle-kit check
node node_modules/vitest/vitest.mjs run tests/migrations
git diff --check
```

比較 harness は `.tmp-container-e2e/measurements/benchmark.py` に保存しました。各呼出しは `CI=true`, `GITHUB_ACTIONS=true`, frozen `GITHUB_SHA`, `GITHUB_RUN_ID=container-experiment-20261012`, `GITHUB_RUN_ATTEMPT=1/2`, `GITHUB_JOB=e2e-shard-1/2`, `NODE_USE_ENV_PROXY=1` を使用しました。SQLite を使う host 検証だけは `/workspace/.yosan-tools/sqlite/usr/bin` を PATH に加え、全 host 検証で writable な `XDG_CONFIG_HOME` を設定しました。設定は各コマンドの環境変数のみです。

証拠は独立 worktree 内の `.tmp-container-e2e/` に残しています（Git 管理対象外）。

- `measurements/verified-results.json`: SHA、lock hash、image ID、各 stage と全体時間、outcome の検証済み集計。
- `measurements/{first,warm}-shard-{1,2}/`: run.log、results.json、manifest、runner、build identity/output digest、全 timing、Japanese screenshot。
- `measurements/*/summary.md`: 既存 E2E summary script の実 report による出力（hosted job time は Unavailable）。
- `static-checks.json`, `workflow-checks.json`: version failure と workflow preservation。
- `format-final.log`, `lint-final.log`, `check-final.log`, `fallow-final.log`, `tests-final.log`, `integration-sql-rerun.log`, `db-check-final.log`, `migrations-final.log`: 検証結果と初回環境不足の記録。

## 解消した障害、残る制約

read-only home による Docker client metadata 書込み失敗、既存 proxy を渡さない direct network failure、既存 CA 未共有による TLS failure、WenQuanYi 優先、root-only fontconfig file、`vfs` の試験 layer 複製によるディスク満杯を検出しました。Docker metadata は disposable project state、既存 proxy / CA は allowlist と read-only mount、fontconfig は scoped fonts と mode 644 で解消しました。TLS 検証無効化、新規 trust root、privileged/capabilities、sysctl、daemon/host security 設定変更はありません。

満杯時の復旧と終了時の整理は、今回作成した image ID / cache ID / 試験 dependency cache だけを対象にしました。通常コマンドが満杯で起動不能になった時点の cleanup 用 read / delete は自動承認レビュー付きで実行しました。既存作業・データを削除していません。終了時には試験 Docker images / build cache を整理し、ディスク空きは約25GBに回復。圧縮 image archive、pnpm store、検証 artifacts は保存し、元 checkout はクリーンです。

残るレビュー項目は、完全 cold image 取得を含む同条件の hosted/Nix 実測、約1GB archive の cache 転送・圧縮コスト、amd64 限定、image publisher signature/attestation 方針、APT snapshot を含む derived image の再現性、Playwright/Node の更新時の digest レビューです。digest pin は content identity であり、Nix の trusted cache signature verification と同じ保証ではありません。採用前には、途中で更新された main に対して別途 rebase と再検証が必要です。

## 変更ファイル

- `.fallowrc.jsonc`
- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`
- `scripts/e2e-container-config.ts`
- `scripts/e2e-container-inner.sh`
- `scripts/e2e-container-prepare.ts`
- `scripts/e2e-container-smoke.ts`
- `scripts/e2e-container.sh`
- `tests/unit/e2e-build.test.ts`
- `tests/unit/e2e-container.test.ts`
- `tests/unit/fallow-ci-policy.test.ts`
- `tooling/ci/container-e2e.md`
- `tooling/ci/container/Dockerfile`
- `tooling/ci/container/fonts.conf`
- `tooling/ci/container/image.json`
- `tooling/ci/container-e2e-results.md`

## Nix 比較の追加調査

追加の実行障害、初回取得／cache 操作の独立計測、再現性・署名・容量・更新待ち・コード量・CachyOS・GitHub Actions の比較は [Nix とコンテナーの比較](nix-container-comparison.md) に保存しました。Nix はこの cloud sandbox で標準 store / namespace の条件を満たせず、cold/warm E2E は未比較です。速度の優劣は断定していません。前回の143件・固定 SHA・計測値を保持しています。
