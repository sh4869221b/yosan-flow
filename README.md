# yosan-flow

Yosan Flow は Cloudflare Workers 上で動く、SvelteKit 製の月予算管理アプリです。

## 前提

- Node.js 20 以上
- pnpm 9 以上
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

- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm build`

## 環境フロー（local / preview / production）

### local

1. `pnpm install`
2. `cp .dev.vars.example .dev.vars`
3. `pnpm wrangler d1 migrations apply DB --local`
4. UI 開発は `pnpm dev`
5. Workers 実行系の確認は `pnpm wrangler dev`
6. 必要に応じて `pnpm check && pnpm test:unit && pnpm test:integration`

### preview

1. preview 用 D1 を作成して `wrangler.jsonc` の `env.preview.d1_databases[0].database_id` を設定
2. `pnpm wrangler d1 migrations apply DB --env preview --remote`
3. `pnpm build`
4. `pnpm wrangler deploy --env preview`
5. preview ホストを Cloudflare Access 保護対象に追加

### production

1. production 用 D1 を作成して `wrangler.jsonc` の `env.production.d1_databases[0].database_id` を設定
2. `pnpm wrangler d1 migrations apply DB --env production --remote`
3. `pnpm check && pnpm test:unit && pnpm test:integration`
4. `pnpm build`
5. `pnpm wrangler deploy --env production`
6. production ホストが Cloudflare Access 保護対象であることを確認

## Cloudflare Access 保護メモ

- 本アプリは Access 通過後のトラフィックのみ到達する前提です。
- preview / production それぞれの公開ホスト名を Access policy に登録してください。
- 未保護の公開 URL を残さないように、DNS/route 設定後に Access 適用漏れを確認してください。
- `wrangler.jsonc` では `workers_dev` / `preview_urls` を明示的に `false` にして、未保護の `*.workers.dev` / preview URL が出ない前提にしています。

## D1 migration 運用メモ

- スキーマは `migrations/*.sql` で管理します。
- ローカル適用: `pnpm wrangler d1 migrations apply DB --local`
- preview 適用: `pnpm wrangler d1 migrations apply DB --env preview --remote`
- production 適用: `pnpm wrangler d1 migrations apply DB --env production --remote`

## Cloudflare 設定

- D1 binding 名は全環境で `DB`（`wrangler.jsonc`）です。
