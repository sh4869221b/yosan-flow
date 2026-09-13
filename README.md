# yosan-flow

Yosan Flow は Cloudflare Workers 上で動く、SvelteKit 製の期間単位の予算管理アプリです。

## 前提

- Node.js: [.node_version](.node_version) に指定されたバージョンを使用
- pnpm: [package.json](package.json) の `packageManager` に指定されたバージョンを使用
- Cloudflare アカウント（D1/Workers 利用時）

## セットアップ（ローカル）

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm wrangler d1 migrations apply DB --local
pnpm dev
```

補足:

- `.dev.vars` は主に `wrangler dev` / `wrangler d1 ... --local` 向けの設定ファイルです。
- 現在の開発サーバー起動は `pnpm dev` (`vite dev`) なので、`.dev.vars` の値は自動では読み込まれません。
- ローカルで Workers 相当の挙動を確認したい場合は `pnpm wrangler dev` を使い、`.dev.vars` をその実行系に渡してください。

## 連続する予算期間の境界を変更する

前の予算期間の終了日を延長して、直後の予算期間の開始日に達する場合は、両方の期間の変更前後を確認するダイアログが表示されます。

- キャンセルまたは Escape キーで閉じた場合は、どちらの期間も変更されません。
- 確定すると、対象期間の終了日と直後の期間の開始日だけが一度に更新されます。直後の期間の終了日、予算、状態は維持されます。
- 確認中に対象データが更新されていた場合は競合として扱われます。最新の内容を確認して、もう一度操作してください。
- さらに後の期間や支出・履歴は移動しません。変更後の日付範囲が成立しない場合は更新が拒否されます。

## ローカル検証コマンド

コード整形:

```bash
pnpm format
pnpm format:check
```

Lint:

```bash
pnpm lint
```

ローカルと CI の基本検証順:

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

CI gate policy:

- Pull request and `main` push CI runs `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, and `pnpm test:e2e`.
- CI executes independent checks in parallel, then reports the aggregate `Quality checks` job after all required jobs succeed.
- Renovate update branch pushes do not run CI directly. Renovate creates PRs immediately after any required Dependency Dashboard approval, and pull request CI is the authoritative validation gate.
- The `E2E` GitHub Actions workflow is still available through `workflow_dispatch` for manual Playwright checks.
- `pnpm test:coverage` reports server/API coverage for unit and integration tests. It is a visibility check, not a required PR gate.

## Dependency updates

Renovate is configured in `renovate.json`.

- Dependency Dashboard Issue is enabled as `Dependency Dashboard`.
- npm package updates wait until the released version is at least 3 days old before Renovate creates an update branch or PR. Local and CI `pnpm install` also enforce the same 3-day minimum release age for direct and transitive dependencies.
- A Renovate-only formatting workflow runs `pnpm install --frozen-lockfile` and `pnpm format` on Renovate PR branches, then commits formatter changes back to the PR branch when dependency updates change formatter output.
- Stable patch/minor updates create PRs immediately, and PR CI is the validation gate.
- Major updates and current `0.x` dependencies require manual approval from the Dependency Dashboard before Renovate creates the update branch or PR.
- Core dependencies still require Dependency Dashboard approval for major updates, but their patch/minor updates create PRs automatically after the 3-day release age gate.
- Core dependencies are the SvelteKit/Svelte/Vite stack, Cloudflare/Wrangler deployment path, Drizzle/Effect server boundary, TypeScript/check/test tooling, and primary Bits UI/date UI dependencies.

E2E を確認する場合:

```bash
pnpm test:e2e
```

Server/API coverage を確認する場合:

```bash
pnpm test:coverage
```

## 環境フロー（local / preview / production）

重要:

- `wrangler.jsonc` の top-level `d1_databases[0].database_id` はローカル開発用プレースホルダです。そのまま `wrangler deploy` を実行すると、Cloudflare 上では存在しない UUID を参照して失敗します。
- preview / production にデプロイするときは、必ず `--env` を指定してください。`wrangler deploy` を引数なしで実行すると root 環境を対象にし、preview / production の D1 binding は使われません。
- Cloudflare の Workers / Pages の build 設定でも、Deploy command は `npx wrangler deploy` ではなく、`pnpm run deploy:preview` または `pnpm run deploy:production` を使ってください。

### local

1. `pnpm install`
2. `cp .dev.vars.example .dev.vars`
3. `pnpm run cf:migrate:local`
4. UI 開発は `pnpm dev`
5. Workers 実行系の確認は `pnpm wrangler dev`
6. 必要に応じて `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build && pnpm test:e2e`

### preview

preview は専用 D1 `yosan-flow-preview` と `yosan-preview.sh4869221b.work` を使用します。UUID と custom domain は `wrangler.jsonc` の `env.preview` に設定されています。

1. 配備前に preview ホストの専用 Cloudflare Access アプリが production と同じ限定された許可対象を持つことを確認する
2. `pnpm run cf:migrate:preview`
3. `pnpm build`
4. `pnpm run deploy:preview`
5. preview ホストで未認証アクセスが Access に転送または拒否され、認証後にアプリへ到達できることを確認する

### production

1. production 用 D1 を作成して `wrangler.jsonc` の `env.production.d1_databases[0].database_id` を実 UUID に置き換える
2. `pnpm run cf:migrate:production`
3. `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build && pnpm test:e2e`
4. `pnpm run deploy:production`
5. production ホストが Cloudflare Access 保護対象であることを確認

## Cloudflare Access 保護メモ

- 本アプリは Access 通過後のトラフィックのみ到達する前提です。
- preview / production それぞれの公開ホスト名を Access policy に登録してください。
- 未保護の公開 URL を残さないように、DNS/route 設定後に Access 適用漏れを確認してください。
- `wrangler.jsonc` では `workers_dev` / `preview_urls` を明示的に `false` にして、未保護の `*.workers.dev` / preview URL が出ない前提にしています。

## 観察可能性

- preview / production は `wrangler.jsonc` で Workers Observability、invocation logs、logs / traces の永続化を有効にしています。Observability / logs / traces の `head_sampling_rate` はすべて `1` で、既存の production の全件サンプリング方針を preview にも適用しています。
- invocation logs / persistent logs / traces は Cloudflare dashboard の Workers Observability から確認します。
- production deploy では source maps も upload します。

### アプリケーションのログ・カスタム span のプライバシー契約

共通基盤は [`src/lib/server/observability/`](src/lib/server/observability/) にあります。ログ payload とカスタム span の名前・属性には、金額、期間・履歴などのドメイン ID、具体的な日付、request / response body、認証情報・headers、ユーザー入力、raw Error・message・stack を含めません。

`TelemetryEvent` は次の六つの必須フィールドと、許可リストにある任意の `error_code` を持ちます。

| フィールド   | 許可する値                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`      | `operation.completed`                                                                                                                                                                                          |
| `operation`  | `period.list` / `period.create` / `period.read` / `period.update` / `period.boundary.propose` / `period.boundary.confirm` / `day.add` / `day.overwrite` / `history.list` / `history.update` / `history.delete` |
| `route`      | `ROUTE_TEMPLATES` の六つの API route template、または `unknown`                                                                                                                                                |
| `method`     | `GET` / `POST` / `PUT` / `PATCH` / `DELETE`                                                                                                                                                                    |
| `outcome`    | `success` / `validation` / `conflict` / `unexpected_error`                                                                                                                                                     |
| `status`     | HTTP response status（100〜599 の整数）                                                                                                                                                                        |
| `error_code` | `schema.ts` の固定コード集合。未知の API error code はログ上だけ `UNKNOWN_ERROR` に置換し、成功時は省略                                                                                                        |

`normalizeRoute(pathname)` は query / fragment を除去し、既知のパスの動的部分を `[periodId]` / `[date]` / `[historyId]` に置き換えます。末尾の `/` は一つまで許容し、未知のパス、完全な URL、余分なパス要素、テスト用 reset route は `unknown` にします。ID や日付自体の妥当性を検証する関数ではありません。

`sanitizeEvent(input)` は六つの必須 own field を検証して新しいオブジェクトへ取り出し、任意の `error_code` も own field かつ許可リスト内の場合だけ追加します。余分なキーやネストしたデータ、未登録・継承された任意コードを捨て、必須フィールドが不正なら `undefined` を返します。`createLogger(sink?).log(input)` はこの処理を通したイベントだけを一つ出力し、不正な入力は出力しません。既定の sink は単一オブジェクトを受け取る `console.log` です。

期間作成・更新、日次加算・上書き、履歴更新・削除では、共通の mutation response 処理が応答を組み立てた後に終端イベントを一度だけ出力します。書込み後の summary / histories 再取得に失敗した場合は、成功イベントを先に出さずエラーイベントだけを記録し、書込みは再実行しません。GET や通常の request log は追加しません。期間削除 API は現時点では存在せず、ログ導入の対象もありません。

成功は `success`、既知の未検出を含む通常の 4xx は `validation`、競合コードまたは 409 は `conflict` です。`PERIOD_OVERLAP` は HTTP 400 のまま `conflict` になります。5xx または `INTERNAL_ERROR` はこれらより優先して `unexpected_error` とし、それ以外の非 4xx エラーも `unexpected_error` にします。分類は既存 API error mapper の status / code を利用し、HTTP status / body は変更しません。想定内の 400 / 404 / 409 も `console.log` に出力し、一律 ERROR 扱いにはしません。

linked boundary の確認要求は `period.boundary.propose` / `PERIOD_BOUNDARY_CONFIRMATION_REQUIRED`、解析に成功した confirmation 付きリクエストは `period.boundary.confirm` で記録します。確認要求の 409 と後続の確定リクエストは、それぞれ一つの操作です。解析前・不正な confirmation は `period.update` のままです。

サービス初期化だけが失敗した場合は、元の例外を伝播したまま `unexpected_error` / 500 / `INTERNAL_ERROR` を一度記録します。この 500 は初期化失敗の分類であり、SvelteKit が生成した最終応答の観測値ではありません。通常のログ sink 例外は再分類せず伝播し、初期化失敗と sink 失敗が重なった場合だけ元の初期化例外を優先します。エラー応答自体を構築できない場合は既存の throw を維持し、存在しない完了応答のイベントは作りません。

API / page は request ごとに `getRequestTracing(platform)` で `platform.ctx.tracing` を取得し、`createTracing(native)` に渡します。native tracing がなければ `noopTracing` を使い、request の adapter をサービスキャッシュに保存しません。Workers 専用の `tracing-workers.ts` も native module から adapter を作る入口として利用できます。

業務 span は次の八つの固定名です。

| span 名                                     | 囲む処理                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `api.budget_period.create`                  | 期間作成の入力解析から応答構築・終端ログまで                              |
| `api.budget_period.update`                  | 通常更新・linked 更新の入力解析から応答構築・終端ログまで                 |
| `api.budget_period.linked_boundary.propose` | 更新親 span 内の、確認要求に必要な両期間の範囲検査と proposal 結果生成    |
| `api.budget_period.linked_boundary.confirm` | 更新親 span 内の、確認時の再判定・proposal 比較・両期間の atomic 更新     |
| `api.daily_total.upsert`                    | 日次加算・上書きの入力解析から summary 再取得・応答構築・終端ログまで     |
| `api.history.update`                        | 履歴更新の入力解析から summary / histories 再取得・応答構築・終端ログまで |
| `api.history.delete`                        | 履歴削除の入力解析から summary / histories 再取得・応答構築・終端ログまで |
| `summary.calculate`                         | 日次集計と期間の読み込みを含む summary 計算全体                           |

`summary.calculate` は mutation 後の再取得では mutation span の子、期間 GET / page load では invocation 配下になります。linked 更新の初期期間・後続期間の読み込みは更新親 span 内にあり、通常更新には proposal / confirm の子 span を作りません。サービス初期化失敗は業務 span の開始前です。期間削除 API は存在しないため、`api.budget_period.delete` は導入していません。D1 のクエリごとの手動 span は追加せず、自動計装を使います。

業務 span の属性は、選んだ固定 span 名と一致する `app.operation` と、既存 route template の任意の `app.route` だけです。加算・上書きは同じ span 名でも異なる固定 route を使い、linked 子 span の route は `/api/periods/[periodId]`、summary では route を省略します。`outcome` / `error_code` は既存の終端ログに残します。属性 supplier は native span に入った後、`isTraced` が true の場合だけ評価・検証し、余分な属性は捨てます。unsampled / no-op では supplier を呼びません。

共通の `TracingAdapter.withSpan` は、既存の固定 operation 名と任意の `TelemetryEvent` を受け取る形式も維持します。既存属性の検証・付与も `isTraced` が true の場合だけ行います。callback に native Span は渡さず、不正な名前では span を作らず work を一度実行し、同期 return / throw と Promise 自体の同一性を維持します。`withTracingEffect` は Effect 実行時に span を開始し、元の成功・失敗・defect を保ったまま完了を待ち、中断時は内部処理の finalizer 完了を待ちます。戻り値やエラーを span 属性やログにコピーしません。

この契約はアプリケーションが作る payload / カスタム span に適用します。Cloudflare が付加する URL・ID・SQL などの標準メタデータは、所有者が承認した例外であり、この sanitizer の対象外です。保存される telemetry 全体の無害化は保証しません。アプリケーション側でこれらの値を payload にコピーすることも禁止します。標準属性は [Cloudflare の Spans and attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/) を参照してください。この一覧から D1 の bind 値が SQL に含まれるとは断定しません。

業務 span のコード導入は [#337](https://github.com/sh4869221b/yosan-flow/issues/337)、以下の運用手順と環境検証は [#338](https://github.com/sh4869221b/yosan-flow/issues/338) に対応します。ローカルテストの native fake や過去 PR の記録は、現在の Dashboard と実 trace の確認を代替しません。

### Dashboard での調査手順

Cloudflare Dashboard の **Workers & Pages → 対象 Worker → Observability → Overview** を開きます。preview は `yosan-flow-preview`、production は `yosan-flow` です。現行 deployment version、logs / traces の設定、利用プランを確認し、保持期間内の開始・終了時刻を UTC で固定します。Visualization、Filter、Group By を設定して Run を選びます。操作の詳細は [Query Builder 公式資料](https://developers.cloudflare.com/workers/observability/query-builder/) を参照してください。

最初に Events の `operation.completed` を一件展開し、上記ログ契約の各フィールドが格納された実キーを確認します。Filter の **Select key** でそのキーを選択してください。以下の `event` / `operation` / `route` / `outcome` / `status` / `error_code` はアプリのフィールド名であり、Dashboard 内の完全なキー名ではありません。prefix やネストは推測せず、invocation 側の HTTP status・runtime outcome・CPU / wall time・version・trace 関連付けも実イベントから区別します。現時点の実画面確認状況は末尾の受け入れ結果に記録します。

全行で Worker と時間範囲を固定し、前の調査の Filter を残さず条件を組み直します。アプリの終端ログの Count は操作件数、invocation の Count は呼出し件数です。同じ request のログを全部数えて request 件数にしないでください。

| 調査入口              | Visualization                         | Filter / Group By                                                                                                                              | 結果の読み方・次の画面                                                                                                   |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1. 業務操作の内訳     | Count                                 | `event` Equals `operation.completed`。`operation`、`route`、`outcome` ごとに集計                                                               | 対象操作の Events を開く。GET に mutation 終端ログを期待しない                                                           |
| 2. 想定外の業務エラー | Count                                 | 終端ログかつ `outcome` Equals `unexpected_error`。`error_code` ごとに集計し、必要なら `operation` / `route` で絞る                             | 終端ログから関連 invocation / trace を開き、失敗箇所と書込み後の再取得を確認                                             |
| 3. HTTP 5xx           | Count                                 | invocation のイベント種別に限定し、実際の response status を Greater or equals `500`、Less `600`。status ごとに集計                            | アプリの `status` と分けて実 HTTP 応答を確認。該当 invocation のログと trace へ進む                                      |
| 4. runtime failure    | Count                                 | invocation のイベント種別に限定し、runtime outcome の exception、resource limit、internal error に対応する実値を個別に検索。outcome ごとに集計 | Worker の Metrics の errors と照合し、該当 invocation の例外と trace を調査。アプリの `outcome` とは別条件               |
| 5. CPU / wall time    | Median (P50)、P95、Max を各指標に設定 | invocation のイベント種別に限定。比較時は同じ version / 対象 route 条件を使用し、数値フィールドと単位を記録                                    | Metrics の CPU Time / Wall Time per execution と確認。遅い invocation の trace で計算と I/O 待ちを切り分ける             |
| 6. 遅い業務処理と D1  | 上の wall time 集計から Events を開く | 対象操作の終端ログに絞り、関連 trace 内で固定 span 名または `app.operation`、必要なら `app.route` を確認                                       | 業務 span から子孫の自動 D1 span を展開し、時間・重なり・親子関係を比較。span に `outcome` / `error_code` 条件を作らない |
| 7. deploy 直後の回帰  | Count と同じ CPU / wall time 統計     | 同じ Worker で配備直前 15 分と直後 15 分を別々に実行。version と request mix を記録                                                            | requests、runtime errors / 率、HTTP 5xx / 率、時間分布を比較し、増加した分類から 2〜6 へ進む                             |

Events から画面に表示される invocation / trace の関連付けを辿り、trace 内で上記八種の業務 span と自動 D1 span を確認します。関連付けが表示されない場合は trace 収集・sampling・保持期間を確認し、未取得として残します。URL や対応関係を推測して補いません。D1 span の時間だけで SQL、ロック、ネットワークなどの原因を断定せず、親の処理時間と他の子 span を合わせて確認します。

確認要求の 409 / `PERIOD_BOUNDARY_CONFIRMATION_REQUIRED` は通常の提案経路です。400 / `PERIOD_OVERLAP` もログ分類は `conflict` で、`UNKNOWN_ERROR` は未知コードのログ上の正規化です。詳細は上記分類契約を参照してください。500 でも書込み後の再取得失敗があり得るため、mutation を再送せず、まず GET または画面の再取得で現状態を確認します。

検索が成功して 0 件だった場合と、クエリエラー、権限不足、Access 未通過、保持期限外、未収集・sampling による欠落を分けて記録します。5xx / runtime failure の 0 件は障害を再現した証拠ではありません。認証が使えない画面では操作を止め、Access policy を緩めません。

### 指標と配備前後比較の読み方

CPU time は I/O 待ちを除く実行時間です。Wall time は I/O 待ちや `waitUntil()` を含む JavaScript context の経過時間で、クライアントへの応答完了時間とは一致しません。Metrics の quantile は sampling に基づくため、Query Builder の標本・統計と混ぜず取得元を記録します。[Metrics 公式資料](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/)

Request duration 専用 chart は Smart Placement 有効時のみ提供されます。本手順では設定を追加せず、chart を取得できなければ実画面での理由を残し、同種の認証済み通常 GET の **Fetch Handler trace duration** を別名の補助指標として採取します。実 trace も取得できない場合は **ブラウザーネットワーク所要時間** を使い、前後で取得元・操作・単位を揃えます。wall time や補助値を request duration と呼ばず、補助値も取れなければ未取得とします。[Request duration の提供条件](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#request-duration)

production 反映は preview 受け入れ後に既存の環境別配備手順で行います。同じアプリ版が配備済みで前後の保持データが使える場合は、それを利用し、比較や文書更新のためだけの再配備はしません。production は通常 GET と自然発生トラフィックで確認し、試験用 mutation・負荷試験・故意の障害は加えません。

比較では UTC の窓、version、request 件数、runtime failure 件数 / request 件数、HTTP 5xx 件数 / HTTP request 件数をそれぞれ記録します。0/0 は 0% にしません。CPU / wall time は同じ表示統計・単位で比較し、request mix、sampling、少数標本の制約を添えます。request なし、権限なし、version 不明、比較窓欠損は比較不能であり「回帰なし」と判定しません。新しい失敗や遅延は上の表から調査し、独断で rollback やアプリ修正は行いません。

### 両環境のリアルタイム tail

checkout の Wrangler でオプションを確認し、各環境へ一つずつ接続します。

```bash
pnpm exec wrangler tail --help
pnpm exec wrangler tail --env preview --format pretty
pnpm exec wrangler tail --env production --format pretty
```

接続時の Worker 名がそれぞれ `yosan-flow-preview` / `yosan-flow` であることを確認します。接続中に認証済み通常 GET を一度行い、対象、接続成立、イベント受信を別々に記録し、各最大 60 秒で Ctrl-C 終了します。Access への転送をアプリ到達と扱わず、GET に mutation 終端ログを期待しません。

同じコマンドに `--status error` を付けると runtime の invocation status で絞れます。`--status` の値は `ok` / `error` / `canceled` で、HTTP 5xx や全業務失敗のフィルターではありません。`--search operation.completed` は終端ログ文字列、`--version-id <実際の version ID>` は特定配備版に絞る用途です。構造化フィールド別の集計には Query Builder を使います。[Wrangler tail オプション](https://developers.cloudflare.com/workers/wrangler/commands/workers/#tail)

tail は過去の永続ログを検索する機能ではありません。高負荷では一部イベントが sampling で欠落するため、受信なしを正常性や未実行の証明に使いません。[Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)

### Sampling・保持期間・費用・共有

この checkout は両環境で logs / traces をそれぞれ有効化し、各 `head_sampling_rate: 1`（100%）を維持します。logs は request 単位で選ばれ、その request 内のログが収集されます。traces は別の有効化・sampling 設定なので、ログ設定だけで trace の収集率を判断しません。[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) / [Traces](https://developers.cloudflare.com/workers/observability/traces/)

導入直後、障害調査中、低トラフィックで契約枠・費用に余裕がある場合は 100% を維持します。実際のログ数・span 数、契約枠、費用見込みに問題がある場合は、必要な調査標本が残るか確認して logs / traces 個別の低減案を所有者に提示します。本手順では設定変更や任意の費用上限を追加しません。低減すると稀な障害や対応する trace が欠ける可能性があり、100% 設定でも保持期限やプラットフォーム制限による欠落は別に確認します。

以下は **2026-09-13 に公式資料を確認した値**です。実アカウントのプラン・使用量は Dashboard で別途確認します。

| Workers プラン | Workers Logs の書込み枠・追加料金                                | ログ保持期間 |
| -------------- | ---------------------------------------------------------------- | ------------ |
| Free           | 200,000 events / 日                                              | 3 日         |
| Paid           | 20 million events / 月を含む。超過 1 million events あたり $0.60 | 7 日         |

課金単位は request 数ではなく書き込まれる log event 数です。Traces は確認日時点では beta 無料で、**2026-10-01 から**各 span が一つの observability event として Workers Logs と共通の枠・料金に算入される予定です。同料金表の保持期間も Free 3 日 / Paid 7 日です。自動 span と custom span を含む実数で費用を見積もり、施行時に公式条件を再確認してください。[Workers Logs の料金・保持期間](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing) / [Traces の料金](https://developers.cloudflare.com/workers/observability/traces/#limits--pricing)

保存ログ・trace は短期の障害調査用で、長期監査記録にはしません。共有時は上記プライバシー契約に従い、画面・tail・標準属性に含まれ得る具体的 URL、ID、SQL、認証情報などを除去します。Cloudflare 標準属性の承認済み例外は独自 payload への転記を許可するものではありません。README には生の telemetry や金額・入力値を貼らず、確認日時、環境、deployment version、検索条件、件数・指標、判定と制約だけを記録します。

### 受け入れ・配備後確認結果

2026-09-13 時点では、上記のソース契約・公式仕様の照合と、実環境の受け入れを分けて扱います。以下の未検証項目は、過去の [PR #419](https://github.com/sh4869221b/yosan-flow/pull/419) の記録で合格に置き換えません。

| 対象                | 確認項目                                                                                                                                                      | 現在の結果                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 両環境 Dashboard    | 現行 version、プラン、配備済み sampling、実キー、7 調査入口、ログ → trace の実導線                                                                            | 未検証。認証付き実画面での確認結果待ち                                                                              |
| preview tail        | 対象 Worker、接続成立、通常 GET のイベント受信、終了                                                                                                          | `yosan-flow-preview` に接続成立。60 秒以内の受信 0 件、Ctrl-C で終了（exit 130）。認証済み GET の到達・受信は未検証 |
| production tail     | 対象 Worker、接続成立、通常 GET のイベント受信、終了                                                                                                          | `yosan-flow` に接続成立。60 秒以内の受信 0 件、Ctrl-C で終了（exit 130）。認証済み GET の到達・受信は未検証         |
| preview 受け入れ    | success / validation / conflict 各 1 件以上、八種 span、自動 D1 の親子関係、privacy                                                                           | 未検証。実操作日時・version・件数を未取得                                                                           |
| preview 失敗経路    | 不正金額の 400 / `INVALID_AMOUNT` と保存内容不変、確認要求 409 と確定前の範囲不変、5xx / runtime failure の検索                                               | 未検証。検索 0 件とも障害再現済みとも判定しない                                                                     |
| production 配備前後 | 対応 version、前後各 15 分の窓・request 件数・runtime errors / 率・HTTP 5xx / 率・CPU / wall time、request duration または理由付き補助値、Access・D1・privacy | 未検証。preview 受け入れ未完了のため比較不能                                                                        |

同日の `wrangler deployments list` では、preview は `f1b3b434-bc80-4f78-b05a-f829229708f9`（2026-09-13T02:31:50.636Z）、production は `98f6c31c-6368-4e2b-8da4-18720466fcbb`（2026-09-13T02:40:54.690Z）がそれぞれ 100% 配信でした。これは配備先 version の確認であり、Dashboard の実 telemetry やアプリ版対応の受け入れではありません。今回の確認では配備を行っていません。両ホストの未認証 GET `/` は HTTP 403（Cloudflare）で、認証済みアプリへの到達は未確認です。tail は上記の環境別コマンドで実行し、終了後の残存セッションはありません。

preview では専用検証期間で期間作成・予算更新・日次加算 / 上書き・履歴編集 / 削除・linked 提案 / 確定を確認し、上記 span 一覧と照合します。使用した保持データと今回生成した操作は区別し、検証期間を残した場合も記録します。既存データ削除や reset は行いません。観測の反映待ちは最大 5 分、一回の待機は 60 秒以内とし、不足項目は未確認として残します。

結果更新時には各行へ日時（UTC）、環境、deployment version、実キーと検索条件、件数・単位・表示統計、判定、sampling / 保持期間 / 権限などの制約を追記します。文書の整形確認だけでは実環境の受け入れは完了せず、preview と production の未検証が解消するまでは #338 / 親 #257 の完了根拠にしません。

## D1 migration 運用メモ

- スキーマは `migrations/*.sql` で管理します。
- `src/lib/server/db/schema.ts` は Drizzle 用の schema mirror です。現時点では SQL migrations が source of truth です。
- migration 以外のアプリケーション DB query path は Drizzle 境界・repository 経由に寄せます。request path では schema を作成しないため、Workers / D1 実行前に対象環境の migration を適用してください。
- Drizzle 生成 migration はまだ採用していません。migration drift check の運用は後続タスクで決めます。
- Drizzle generated migration checks / drift checks are not required in CI at this stage. TypeScript import and type safety coverage through `pnpm check` is sufficient for now.
- ローカル適用: `pnpm run cf:migrate:local`
- preview 適用: `pnpm run cf:migrate:preview`
- production 適用: `pnpm run cf:migrate:production`

## Cloudflare 設定

- D1 binding 名は全環境で `DB`（`wrangler.jsonc`）です。
- `wrangler.jsonc` の binding を変更したら、`XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types` と `XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types worker-runtime.d.ts --include-env false` を再実行してください。
- deploy 前に `env.preview` / `env.production` の `database_id` がプレースホルダ (`00000000-0000-0000-0000-000000000000`) のままでないことを確認してください。
- Cloudflare Workers Builds の Build Variable `PNPM_VERSION` は `package.json` の `packageManager` のバージョン部分（`pnpm@` を除いた値）に合わせてください。Renovate が `packageManager` を更新した際は、この Build Variable も更新してください。
- Cloudflare dashboard の Deploy command 例:
  - preview: `pnpm run deploy:preview`
  - production: `pnpm run deploy:production`
