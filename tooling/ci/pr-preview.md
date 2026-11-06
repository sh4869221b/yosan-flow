# PRごとの公開Preview（#544）

SvelteKit / Cloudflare adapter / Wrangler Worker Previewsを使用します。
既存の`wrangler.jsonc`、保護された共用
preview、本番D1、Access、CI / E2Eの設定は変更しません。

## 配備までに必要な設定（管理者による別途作業）

この実装を追加しただけではCloudflareリソースは作成されません。
以下はアカウント・公開設定・認証情報を変更するため、レビューしてから実施します。

1. CloudflareアカウントのWorker Previews対応、workers.devサブドメインとプランの
   D1数・容量・read/write・Workers request/CPU・Preview上限を管理画面で確認します。
   公開URLは誰でも読書きできます。実際の予算・履歴・個人情報を入力しない運用です。
2. PR用アカウントへの限定を推奨します。対象アカウントだけのWorkers Scripts Editと
   D1 Editを持つAPI tokenを用意します。必要ならAccount Settings Readも付けて
   workers.devサブドメイン取得を許可します。DNS / Access / 本番secretの権限は不要です。
   アカウント権限はWorker名やD1 prefix単位への隔離を保証しません。
   同一repoのPRコードは信頼済みとして実行されます。信頼できないコードを同一repoへ
   pushしないでください。forkはCI成功でも明示的にskipします。
3. GitHub ActionsにSecrets `PR_PREVIEW_CLOUDFLARE_API_TOKEN` と
   `PR_PREVIEW_CLOUDFLARE_ACCOUNT_ID` を登録します。既存本番用secretを流用しません。
   Workflowの`GITHUB_TOKEN`はPRコメント更新だけに使用します。
4. クリーンなmain checkoutから、専用親Workerだけを初期配備します。
   `pnpm exec wrangler deploy --config wrangler.pr-preview.json`
   `workers_dev: false` / `preview_urls: true`を確認します。親は404だけを返し、DB・assets・
   vars・secret・routeを持ちません。Version URLもアプリを公開しません。
   Preview Baseにもbinding/secretを登録しません。PR作成コマンドは
   `--ignore-base-config`を使います。既存PreviewにDB/ASSETS以外のbindingやsecretが
   ある場合、継承を避けるため配備を拒否します。親の設定を既存Workerへ適用しません。
5. このworkflowがdefault branchに入ってから有効になります。既に開いている同一repo
   PRはCIを再実行すると対象になります。fork / 古いHEAD / CI失敗はrun summaryにskipを残します。

## ライフサイクルと失敗

`CI`の`workflow_run.completed`から、pull_request起点・同一repo・最新HEAD・成功した
`Quality checks`を確認します。制御コードは常にdefault branchから取得し、PRの
HEADを別checkoutでインストール・ビルドします。ビルドには配備credentialを渡しません。
PRのmigrationだけを`yosan-flow-pr-<番号>`に適用し、成功後に`pr-<番号>`を配備します。
DBは既存なら再利用し、migration履歴を維持します。seedや既存データのコピーはしません。
PR内でも一度適用したSQLは書き換えず、追加migrationで変更します。Wranglerは適用済みの
ファイル名を記録するため、同名SQLの書換えを再適用しません。自動resetでデータを捨てる動作はありません。

`previews.d1_databases.DB`とmigration専用設定は同一bindingから生成します。
一時設定はrootの`.tmp-pr-*.json`だけです。共用・本番・placeholder UUIDと重複するDB、
同じUUIDを持つ別DB、曖昧な名前は拒否します。productionや共用previewのrouteは継承しません。

配備後はJSONの`.preview.urls[0]`を検証し、認証なし・redirectなしで`/`のHTMLと
`/api/periods`のD1 readをprobeします。DNS/配備伝播は最大6回再試行します。
E2E reset token、ローカルintent、認証secretは渡しません。ObservabilityはPreview側だけ
に設定し、既存の金額・ユーザー入力・IDをlog/spanに入れないprivacy contractを保ちます。

作成とclose cleanupは同じPRのconcurrency groupで直列化し、途中キャンセルしません。
既存CIの旧run取消しは別workflowなので、配備・削除を中断しません。
migration前、配備直前、配備後、probe後にHEAD/stateを再確認します。close検出時には
同じrunでcleanupし、closeイベントも独立してcleanupします。新HEADなら旧runは配備を
見送ります。チェック直後のpushとの短い競合では旧版が一時公開され得ますが、新CIが成功後
同じURLを更新します。新CI失敗時は旧版が残り、コメントのSHAで区別します。
GitHub concurrencyは待機runを置換し順序を保証しません。各runが現在stateを再確認するため、
close後の古いrunは再作成しません。reopen後の古いclose処理は削除しません。

close（merge含む）は`pull_request_target.closed`を使い、信頼済みmainだけをcheckoutします。
Previewの実在・名前・IDを確認し、公式`wrangler preview delete`で削除します。
D1は完全一致名から実UUIDを再取得・検証して削除します。既にないリソースだけ成功扱いにし、
権限/API/上限エラーを不存在として隠しません。Preview削除失敗ならD1は残して再試行可能にします。

PRコメントは専用markerを持つGitHub Actions botの1件を更新します。失敗はrunリンクと
SHAを示します（既存URLが古い可能性あり）。CLIのraw出力、SQL、API body、tokenは
コメントやログに出しません。詳細はCloudflare管理画面で対象リソースを確認してください。

## コストと復旧

1 PRにつきD1を1つ消費し、追加pushでも同じDB/固定URLを再利用します。
`PR_PREVIEW_MAX_DATABASES` repository variable（既定10）は新規DB作成前の予算ガードです。
複数PRが同時作成する場合に多少超える可能性があるsoft capです。Cloudflareの実上限/API失敗
は配備を停止します。公開URLの第三者アクセスもquota/課金対象です。プランの上限・予算通知を
確認し、不要PRをcloseしてください。無料枠や価格を固定値で仮定しません。

途中失敗・タイムアウト・手動キャンセル・Actions停止時は孤児DB/Previewが残る場合があります。
失敗runの`Re-run failed jobs`で現在のPR状態を再確認して再実行します。
main側で制御コードを修正した後は`Re-run all jobs`してください。
close/reopenの順序や配備不明時は、先にCloudflare側の現在stateを確認します。

手動棚卸し（read-only）:

```bash
pnpm exec wrangler preview list --config wrangler.pr-preview.json --json
pnpm exec wrangler d1 list --json
gh pr list --state open --repo sh4869221b/yosan-flow
```

`pr-<番号>` / `yosan-flow-pr-<番号>`をPR一覧と照合し、closed PRだけを対象にします。
対象アカウント、親Worker、DB完全一致名と実UUID、本番/共用preview/他PRとUUIDが違うことを
確認し、承認してから以下を実行します。名前の部分一致やprefix一括削除はしません。

```bash
pnpm exec wrangler preview delete --name pr-123 --skip-confirmation --config wrangler.pr-preview.json
pnpm exec wrangler d1 delete <確認したPR専用UUID> --skip-confirmation
```

## 実機の受け入れ確認（未実施）

認証情報・リソース作成・公開設定の承認後、2つのPRで異なるURL/UUIDを確認します。
片方だけで人工の期間と支出を登録し、他方と共用preview/本番に影響がないことを確認します。
片方に追加pushしてURL/UUID/人工データを保持し、migration失敗時に更新されないことを確認します。
両PRをcloseしてURL無効化・D1削除と再実行の冪等性を確認します。
fork、CI失敗、短時間のpush/close/reopen、API失敗・quota超過も確認します。
ローカルテストはAPI fakeと使い捨て設定を使うため、Cloudflare実機での証明は別です。

公式資料:
[Worker Previews](https://developers.cloudflare.com/workers/previews/)、
[リソース分離](https://developers.cloudflare.com/workers/previews/resources/)、
[Actions例](https://developers.cloudflare.com/workers/previews/examples/)。
