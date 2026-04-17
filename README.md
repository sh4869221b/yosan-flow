# yosan-flow

Yosan Flow は Cloudflare Workers 上で動く、SvelteKit 製の月予算管理アプリです。

## 最小要件

- Node.js 20 以上
- pnpm 9 以上
- Cloudflare アカウント（D1/Workers 利用時）

## セットアップ

```bash
pnpm install
cp .dev.vars.example .dev.vars
```

## Scripts

- `pnpm dev`
- `pnpm check`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm build`

## Cloudflare 設定

- D1 binding 名は `DB`（`wrangler.jsonc`）です。
