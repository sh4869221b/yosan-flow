# Container E2E

通常開発と非 E2E CI は既存 Node/pnpm のままです。ローカル、CI、手動 E2E
だけ、公式 Playwright Ubuntu image を使い、依存導入・smoke・build・verify・
Wrangler・使い捨て D1・Playwright を同じ container/path で実行します。

## 実行

Linux x86_64/amd64、Docker Engine と BuildKit、bash、プロジェクト定義の Node
が必要です。Node は `.node_version`、pnpm は `package.json#packageManager`、
Playwright の解決版は `pnpm-lock.yaml` が正です。通常開発の手順は変えません。

```bash
pnpm test:e2e
pnpm test:e2e --shard=1/2
pnpm test:e2e --shard=2/2
pnpm test:e2e --grep 'budget'
```

標準入口は `scripts/e2e-container.sh` です。CI/手動 workflow も同じ入口を使い、
shard は別 runner、各１ worker で実行します。Playwright 引数は literal argv
として渡し、wrapper が workers=1 を固定します。`test:e2e:worker` は container
内部専用の Playwright command で、host 開発環境の代替入口ではありません。
ローカルでは suite 全体を実行し、元の build-before-migration path を使います。

E2E checkout に `.env*` / `.dev.vars*`（example 除く）がある場合は、内容を
表示せず実行前に拒否します。開発用秘密情報を削除せず、必要なら secret-free
worktree を使ってください。未コミット変更を試す場合も env file を含まない
作業領域が必要です。host の cloud token / app env は container に転送しません。
CI の E2E checkout は `persist-credentials: false` にし、Git token を残しません。

```bash
git worktree add --detach ../yosan-flow-e2e HEAD
cd ../yosan-flow-e2e
# Node/pnpm はプロジェクト定義を使用する
pnpm test:e2e
```

workspace は生成物のため writable、外部 Git metadata は read-only で mount。
node_modules は anonymous disposable volume（--rm で回収）に分離し、host の
開発依存を上書きしません。pnpm store だけを専用 bind mount で再利用します。
一つの container を `/work/yosan-flow` で動かし、呼出し元 UID/GID を使います。
既存の CI prebuild SHA/run/attempt/job/cwd/Node/env/output digest/timing guard
は変更しません。CI だけ container 内で build 後に PREBUILT flag を設定します。
local-intent/reset token、local migrations、D1 分離、test inventory、Quality、
JSON/HTML/Wrangler diagnostics と７日の保持を維持します。remote D1 は使いません。

## 固定と配布元

`container/image.json` は公式 MCR Playwright Noble の readable tag と
linux/amd64 manifest digest を固定します。`e2e-container-config.ts` は package
range だけでなく lock の解決済み Playwright を読み、image tag と一致しない
変更、曖昧・未対応 lock layout を取得前に拒否します。smoke では installed
@test / Playwright / core、headless revision と実 browser version、FFmpeg
revision/executable と real video、日本語 font selection/screenshot を確認します。

Node tag は `.node_version` から組み立て、公式 `docker.io/library/node` の
`nodeDigest` 固定 executable を Noble に取り込み、実行版を再検証します。
pnpm の版・official registry archive の SHA-512 は既存定義と manager lock を
再利用する `scripts/pnpm-e2e.ts` で検証し、手作業の別 version 定義を持ちません。
依存は frozen lock、release-age/supply-chain/build policy を維持します。

Noto CJK は official Ubuntu signed APT metadata と Dockerfile の exact package
version から取得し、scoped fontconfig で Noto JP / DejaVu を選びます。
Docker build context は Dockerfile と fonts.conf だけです。app checkout、
node_modules、env、Git credentials、D1 state を COPY しません。read-only build
mount で Node/fontconfig を入れ、derived filesystem を一つの layer にまとめます。

[公式 Playwright Docker](https://playwright.dev/docs/docker) が配布元と対応
image を説明しています。digest は content identity で、publisher signature
の検証ではありません。以前の Nix trusted-cache signature verification と同じ
保証ではありません。OCI publisher signature/attestation は未検証です。
APT package version は固定しますが repository snapshot や derived image 全体の
独立 digest は固定していません。kernel/engine/resource policy も host に依存します。

## Cache と容量

Actions cache は `.tmp-container-store` の pnpm store だけです。exact key は
lock、image/font/build configuration、Node 定義、OS/architecture を含みます。
image は各 hosted runner で official registry の digest から取得し、build します。
Docker のその runner/local 内の layer cache は再利用しますが、image tar/gzip を
repository cache に保存・復元しません。比較用 workflow / artifact snapshot
transport は運用に持ち込みません。過去の Nix cache をこの PR で削除しません。

[draft comparison #527](https://github.com/sh4869221b/yosan-flow/pull/527) では、
元の image gzip 保存に約124秒、復元に34〜48秒、image snapshot は約1.06GB
かかりました。この移行ではその保存/転送をなくしますが、この新しい cache 方針
そのものを同条件の Nix より速いと主張しません。official base の不要 browser
も含む取得サイズ、registry availability/rate limits、APT retrieval は残ります。

`.tmp-container-e2e/*-timing.json` は pulls/build/bootstrap/dependencies/smoke/
app build/test/total を記録し、manifest と image ID/cache-hit を timing artifact
へ常時保存します。失敗時は元の diagnostics と日本語 screenshot を保存します。
`vfs` driver は layer/container 全体をコピーし、overlay2 より disk を使う場合が
あります。ホスト設定・権限・sandbox・sysctl を変えて実行を通すことはしません。

## 更新と既存 PR

Playwright の解決版が変わったら、同じ release の official MCR tag/digest を
review して image.json と一緒に更新します。Node 更新も対応する official Node
digest を review し、binary/smoke/E2E を再検証します。pnpm は manager lock と
packageManager の更新を再利用します。font/Ubuntu 変更は package pin/config を
review。`latest` や古い browser、host executable への自動 fallback はありません。

この移行は Playwright 更新を含みません。#522 の Playwright update と #526 の
lock maintenance は別 PR のままで、merge 後に rebase/再検証が必要です。解決版が
変わるなら matching image 更新も必要で、npm-only update は fail closed です。
既存 PR をこの作業で編集・merge せず、比較 PR #527 も閉じません。

CachyOS では Ubuntu userland の隔離が目的ですが、今回の検証環境は cloud Linux
と hosted Ubuntu です。CachyOS、Podman/rootless、他 architecture は未検証です。
