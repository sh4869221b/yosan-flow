# Renovate Dependency Automation Plan

**Goal:** Renovate を導入し、通常の patch/minor は即時 PR 化し、major / 0.x / 中核依存は Dependency Dashboard Issue で手動承認する。PR CI を依存更新の authoritative validation gate にする。

**Scope:**

- Add `renovate.json`.
- Update `.github/workflows/ci.yml` so pull requests and `main` pushes run the existing CI gate plus E2E in parallel, while `renovate/**` branch pushes do not run duplicate CI.
- Document the dependency update policy in `README.md` and `CONTRIBUTING.md`.

**Policy:**

- Dependency Dashboard Issue is enabled.
- Stable patch/minor updates use immediate PR creation.
- Major updates require `dependencyDashboardApproval`.
- Current `0.x` dependencies require `dependencyDashboardApproval`.
- Core dependencies require `dependencyDashboardApproval`.
- Pull request CI is the authoritative validation gate; the aggregate `Quality checks` job depends on all parallel CI jobs, and automerge remains disabled.

**Core dependencies for this repository:**

- SvelteKit / Svelte / Vite framework and build stack.
- Cloudflare / Wrangler deployment path.
- Drizzle / Effect server and database boundary.
- TypeScript, Svelte check, Vitest, and Playwright quality-gate tooling.
- Bits UI and date UI dependencies used by the primary dashboard surface.

**Verification:**

- Validate Renovate config with the official Renovate validator.
- Run formatter check for edited JSON / Markdown / YAML.
- Run the existing CI gate if config validation or formatting touches repository-wide files.
