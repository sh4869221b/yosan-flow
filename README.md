# yosan-flow

Yosan Flow は Cloudflare Workers 上で動く、SvelteKit 製の月予算管理アプリです。

## 前提

- Node.js 24.15 以上
- pnpm 10.33.3 以上
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
```

CI gate policy:

- Required on pull requests and `main` pushes: `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test:unit` → `pnpm test:integration` → `pnpm build`
- Renovate update branches also run the same CI gate on `renovate/**` pushes, so Renovate can wait for a green branch before opening selected PRs.
- `pnpm test:e2e` is not a required PR gate for now. Run it manually when browser workflows/UI flows change.
- `pnpm test:coverage` reports server/API coverage for unit and integration tests. It is a visibility check, not a required PR gate.
- The `E2E` GitHub Actions workflow is available through `workflow_dispatch` for optional Playwright checks.

## Dependency updates

Renovate is configured in `renovate.json`.

- Dependency Dashboard Issue is enabled as `Dependency Dashboard`.
- Stable patch/minor updates create PRs only after CI succeeds on the `renovate/**` branch.
- Major updates, current `0.x` dependencies, and core framework/runtime/deployment/database/UI dependencies require manual approval from the Dependency Dashboard before Renovate creates the update branch or PR.
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
6. 必要に応じて `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build`

### preview

1. preview 用 D1 を作成して `wrangler.jsonc` の `env.preview.d1_databases[0].database_id` を実 UUID に置き換える
2. `pnpm run cf:migrate:preview`
3. `pnpm build`
4. `pnpm run deploy:preview`
5. preview ホストを Cloudflare Access 保護対象に追加

### production

1. production 用 D1 を作成して `wrangler.jsonc` の `env.production.d1_databases[0].database_id` を実 UUID に置き換える
2. `pnpm run cf:migrate:production`
3. `pnpm format:check && pnpm lint && pnpm check && pnpm test:unit && pnpm test:integration && pnpm build`
4. `pnpm run deploy:production`
5. production ホストが Cloudflare Access 保護対象であることを確認

## Cloudflare Access 保護メモ

- 本アプリは Access 通過後のトラフィックのみ到達する前提です。
- preview / production それぞれの公開ホスト名を Access policy に登録してください。
- 未保護の公開 URL を残さないように、DNS/route 設定後に Access 適用漏れを確認してください。
- `wrangler.jsonc` では `workers_dev` / `preview_urls` を明示的に `false` にして、未保護の `*.workers.dev` / preview URL が出ない前提にしています。

## 観察可能性

- production は `wrangler.jsonc` で Workers Observability を有効化しています。
- invocation logs / persistent logs / traces は Cloudflare dashboard の Workers Observability から確認します。
- runtime log をリアルタイムに見る場合:

```bash
pnpm wrangler tail yosan-flow --env production --format pretty
```

- エラーだけ追う場合:

```bash
pnpm wrangler tail yosan-flow --env production --status error --format pretty
```

- production deploy では source maps も upload します。

## D1 migration 運用メモ

- スキーマは `migrations/*.sql` で管理します。
- `src/lib/server/db/schema.ts` は Drizzle 用の schema mirror です。現時点では SQL migrations が source of truth です。
- Drizzle 生成 migration はまだ採用していません。migration drift check の運用は後続タスクで決めます。
- Drizzle generated migration checks / drift checks are not required in CI at this stage. TypeScript import and type safety coverage through `pnpm check` is sufficient for now.
- ローカル適用: `pnpm run cf:migrate:local`
- preview 適用: `pnpm run cf:migrate:preview`
- production 適用: `pnpm run cf:migrate:production`

## Cloudflare 設定

- D1 binding 名は全環境で `DB`（`wrangler.jsonc`）です。
- deploy 前に `env.preview` / `env.production` の `database_id` がプレースホルダ (`00000000-0000-0000-0000-000000000000`) のままでないことを確認してください。
- Cloudflare Workers Builds の Build Variable は `PNPM_VERSION=10.33.3` に固定してください。
- Cloudflare dashboard の Deploy command 例:
  - preview: `pnpm run deploy:preview`
  - production: `pnpm run deploy:production`
