# Renovate Dependency Automation Plan

**Goal:** Renovate を導入し、通常の patch/minor は CI 成功後に PR 化し、major / 0.x / 中核依存は Dependency Dashboard Issue で手動承認する。

**Scope:**

- Add `renovate.json`.
- Update `.github/workflows/ci.yml` so `renovate/**` branch pushes run the existing CI gate.
- Document the dependency update policy in `README.md` and `CONTRIBUTING.md`.

**Policy:**

- Dependency Dashboard Issue is enabled.
- Stable patch/minor updates use `prCreation: "status-success"`.
- Major updates require `dependencyDashboardApproval`.
- Current `0.x` dependencies require `dependencyDashboardApproval`.
- Core dependencies require `dependencyDashboardApproval`.

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
