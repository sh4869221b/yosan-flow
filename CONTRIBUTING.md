# Contributing

## Setup

Requirements:

- Node.js: use the version specified in [.node_version](.node_version).
- pnpm: use the exact version specified by `packageManager` in [package.json](package.json).
- Cloudflare account for D1/Workers checks

Install dependencies and prepare local D1:

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm run cf:migrate:local
```

Start the Vite development server:

```bash
pnpm dev
```

For Workers-like local execution, use Wrangler:

```bash
pnpm wrangler dev
```

When `wrangler.jsonc` bindings change, regenerate checked-in Worker types:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" pnpm wrangler types worker-runtime.d.ts --include-env false
```

## Project Shape

- `src/routes/`: SvelteKit routes and server load logic.
- `src/lib/components/`: Svelte UI components.
- `src/lib/server/`: server-side repositories, services, and validation.
- `migrations/`: immutable legacy SQL plus Drizzle-generated SQL and metadata.
- `src/lib/server/db/schema.ts`: canonical schema for future Drizzle migrations.
- `tests/unit/`: domain and calculation tests.
- `tests/integration/`: API/repository integration tests.
- `tests/e2e/`: Playwright dashboard tests.

## Cloudflare runtime boundary

Server routes and page loads read bindings from `cloudflare:workers` through
`getApiServices()`. Services remain cached by D1 binding identity in a `WeakMap`;
request tracing is resolved separately by `getRequestTracing()` and never stored
in that cache. No route reads Cloudflare APIs from `event.platform`.

A missing `env.DB` fails closed. The only in-memory runtime path is an explicit
`YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1` in Vite development, from the shell or local
`.dev.vars`. Built Workers ignore that development flag. Dependency-injected
handler factories still accept fresh in-memory services directly for tests.

Vitest mocks `cloudflare:workers` in `tests/setup-cloudflare.ts`. Default-handler
and migration tests configure `tests/helpers/cloudflare-runtime.ts`, which is
reset before each test; they do not synthesize obsolete platform bindings. Tests
using this mutable runtime seam must remain sequential within each test file.
The reset endpoint keeps its explicit local/test token, required DB, deletion
order and before/after counts. Never configure the E2E reset token in preview or
production. Real adapter behavior is verified by the built Worker E2E suite.

## Development Guidelines

- Keep the period-first budget model as the default design. Do not add month-first compatibility paths unless explicitly requested.
- Keep the main dashboard optimized for quickly understanding today's allowance, today's usage, today's remaining amount, and the current period state.
- Use existing repository patterns before introducing new abstractions.
- Update relevant user-facing documentation when behavior changes.
- Do not commit `.dev.vars`, `.env`, `.wrangler`, `.tmp-*`, `test-results`, or other local state.

## Styling migration

Tailwind CSS v4 uses the `tailwindcss` and `@tailwindcss/vite` development
dependencies. Keep the existing SvelteKit configuration, Cloudflare adapter and
proxy, version polling, and Worker output contract when changing the Vite plugin
configuration. The root `src/routes/+layout.svelte` imports `src/app.css` once and
renders its children without an extra DOM wrapper. The stylesheet imports are:

```css
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities) source("./");
```

The source path is relative to `src/app.css`, so utility detection starts in
`src`, rather than relying on examples in tests or root documentation. Use
complete, static utility class names in scanned source. Keep the existing
`dashboard-shell.css` imports in both `+page.svelte` and `+error.svelte`.

### Semantic tokens

`src/app.css` defines canonical values in `:root` within `base`, making them
available to both the dashboard and portaled dialogs. `@theme inline static` connects
those values to Tailwind: for example, `--color-primary: var(--primary)` generates
`bg-primary` / `text-primary`, while scoped CSS uses `var(--primary)` directly.
Keep `static`: without it, Tailwind can omit aliases such as `--radius-md`,
`--radius-lg` and `--radius-panel` when no corresponding utility class is used,
leaving scoped `var()` references unresolved. `static` guarantees alias output;
canonical values still belong to `:root`.
Use complete CSS colors, not HSL channel fragments, and do not maintain a second
palette for shadcn. The token names follow the
[shadcn-svelte theme convention](https://www.shadcn-svelte.com/docs/theming).

| Role                      | Canonical token and current value                                                                               | Use                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Page                      | `background: #f8f5ef`, `background-mobile: #f4f1eb`, `foreground: #2f2219`                                      | `background` switches to the mobile value at 760px; foreground remains shared           |
| Raised surfaces           | `card: #fffdf8`, `popover: var(--card)`                                                                         | Each has a foreground alias to `foreground`; dialogs use popover                        |
| Primary action            | `primary: #2f6d3b`, `primary-foreground: #fff`                                                                  | Save and other primary actions                                                          |
| Secondary action          | `secondary: #f5f1e9`, `secondary-foreground: var(--foreground)`                                                 | Close/cancel and range-navigation surfaces                                              |
| Quiet surface and text    | `muted: #f8f3e9`, `muted-foreground: #76675b`                                                                   | Neutral comparisons, metadata and supporting text                                       |
| Selection                 | `accent: #dcefd7`, `accent-foreground: #245f31`                                                                 | Selected range dates                                                                    |
| Destructive action        | `destructive: #9b2c22`, `destructive-foreground: #fff`                                                          | Delete confirmation actions                                                             |
| Borders and inputs        | `border: #e4ddd2`, `input: #ded3c6`, `input-background: #fff`                                                   | `input` is a border color; input fill has a separate role                               |
| Budget amounts            | `budget-positive: #3e8445`, `budget-used: #3a2a20`                                                              | Allowance/remaining totals and today's used amount                                      |
| Recorded spending         | `budget-spent: #d96945`                                                                                         | Calendar amounts with a recorded expenditure                                            |
| Shortfall and excess      | `budget-negative: #b4473e`, `budget-over: #8b3a3a`                                                              | Negative adjustment and the existing over-budget warning                                |
| Validation                | `invalid: #8b3a3a`, `invalid-border: #b33a3a`                                                                   | Invalid-field messages and borders; message shades are consolidated                     |
| Destructive feedback      | `destructive-subtle: #fff1f0`, `destructive-border: #efc3bd`                                                    | Error/delete-confirmation surfaces                                                      |
| Success feedback          | `success: #276432`, `success-subtle: #edf7ea`, `success-border: #bad8b7`                                        | Saved/saving status presentation                                                        |
| Planned entry             | `planned: #74501b`, `planned-subtle: #fff7e8`, `planned-border: #ecd6aa`                                        | Future-day entry note                                                                   |
| Icons and focus           | `icon-foreground: #397d3d`, `ring: #2f76c2`                                                                     | Emphasized icons and the standard keyboard outline                                      |
| Specific focus treatments | `focus-range: var(--accent-foreground)`, `focus-summary: var(--icon-foreground)`, `focus-confirmation: #e1a540` | Existing range, disclosure and boundary-confirmation indicators                         |
| Radius                    | `radius: 10px`, `panel-radius: 12px`                                                                            | Theme sizes `md/lg/xl/2xl` resolve to 8/10/14/18px; `panel` is 12px                     |
| Elevation                 | `elevation-card: 0 18px 60px rgba(51, 38, 26, 0.07)`, `elevation-dialog: 0 24px 80px rgba(51, 38, 26, 0.24)`    | Exposed as `shadow-card` and `shadow-dialog`                                            |
| Overlay                   | `overlay: rgba(47, 34, 25, 0.56)`                                                                               | Dialog backdrop                                                                         |
| Panel spacing             | `panel-padding-block: 1.15rem`, `panel-padding-inline: 1.25rem`, `panel-padding-mobile: 0.95rem`                | Shared card/dialog padding; sheets also account for safe areas                          |
| Page and controls         | `page-gutter: 1.35rem` / `1rem` / `0.75rem`, `control-height: 2.65rem`                                          | Gutter changes at 900px/760px; exposed as `page-gutter` and `control` spacing utilities |

All token names in the table have a `--` prefix in CSS. Financial roles remain
separate from actions and validation even when their current values coincide.
Token extraction does not add state classification: remaining amounts keep their
existing presentation, and a spent calendar day does not mean it is over budget.
Calendar weekday colors, hover/today treatments, gradients and exceptional local
dimensions remain with their component owners. Tailwind's default spacing unit is
unchanged. Add a token when it names a shared meaning, rather than converting
every literal or rounding every dimension to the utility scale.

Preserve this stylesheet and its token values when acquiring shadcn components.
Add chart, sidebar or dark tokens only when a component actually needs them.
Basic UI is adopted in #582; Dialog/Sheet and RangeCalendar replacement remain
the responsibility of #583 and #584.

### Reset and ownership

[#581](https://github.com/sh4869221b/yosan-flow/issues/581) adopts the complete
Preflight reset before component migration. This provides consistent defaults for
existing controls and future shadcn components. Its `border-box`, inherited
control fonts, `1.5` default line-height and cleared browser margins are intentional;
matching the earlier browser-default geometry is not an acceptance condition.
Do not restore content-box or browser margins globally, or add broad `revert`
rules solely to reproduce an old screenshot.

The small application base supplies the Japanese font stack, page foreground and
background, default border color, and a visible `2px` keyboard outline with a
`2px` offset. Disabled native controls (including `aria-disabled` buttons) use
reduced opacity and a disabled cursor; existing saving-state rules can override
these defaults. Bits UI range days own their equivalent disabled treatment.
Setting border color does not create a border: components still own
its width and style. Existing component focus rules take precedence where their
shape or offset matters, including selected calendar cells.

Component CSS owns heading weight/size, intentional content gaps, input surfaces,
responsive layout and state treatments. Empty/error headings and missing-history
readonly inputs need explicit presentation because Preflight clears their native
defaults. The two calendar tables retain their deliberate separate borders and
cell sizing; history lists and disclosure markers retain their authored rules.
The page shell owns only page width, centering and token-based padding; body
defaults and responsive page tokens are owned by `app.css`.

Existing unlayered CSS takes precedence over normal declarations in Tailwind's
layers. For example, `.dashboard-page` in `dashboard-shell.css` keeps its padding
from `--page-gutter` at the existing breakpoints even if `p-0` is added. Migrate
one property and its responsive/state variants together: replace
or remove its old declaration locally when a utility takes ownership. Do not add
blanket `!important` or move all existing CSS into a layer to hide conflicts.

### Styling verification

Verify utility generation and computed styles in both Vite development and the
built Worker. Browser-only class injection does not generate a utility: any
temporary smoke fixture must supply static candidates inside the scanned source
and be removed before the final rebuild and quality checks. Check the import
graph and generated CSS for Preflight's element resets, not merely for universal
selectors: Tailwind's `--tw-*` property initialization can use those selectors
without Preflight.

Compare desktop/mobile screenshots and key computed styles using the same seed,
clock, viewport and loaded fonts. Include body, headings, button/input/textarea,
native select, lists/tables, calendar, dialogs and mobile sheets. Exercise empty,
loading, invalid, disabled, success and destructive states, including missing
history while editing. A focused control must have a visible indicator even when
selected/today states overlap. Check the control's bounds inside its cell, not
only document overflow. Check initial SSR before
hydration, hydrated interactions, direct error-page loads, router errors and
retry/back navigation for missing or accumulating styles. Preserve existing URL,
focus, loading and `data-testid` contracts. Use 1280px/375px for main comparisons,
320px/768px and a wide desktop such as 1600px for overflow, and both sides of the
760px/900px breakpoints for responsive transitions. Differences in line-height,
control fonts, palette consolidation and card geometry are expected; review them
for hierarchy, readability, clipping, reachable actions and state distinction
instead of requiring zero pixel differences. Save comparison evidence separately
before another container run clears `test-results` and `playwright-report`.

Run affected specs through the existing container entry point, for example:

```bash
pnpm test:e2e tests/e2e/dashboard-shell.spec.ts tests/e2e/dashboard-hydration.spec.ts tests/e2e/framework-error-retry.spec.ts
```

These specs run against the built Worker; they do not replace the separate Vite
development smoke check. Complete the required quality gates below as well.

The #581 reset decision was checked on 2026-10-29 against the `6c2e13d` baseline:
33 candidate captures covered the surfaces above, including 25 paired comparisons,
with no horizontal overflow at the listed widths. Vite and Worker computed styles
agreed for 25 semantic utility roles, seven reset elements and seven direct alias
references at desktop/mobile widths. The final fixture-free Worker build retains
the static aliases. The container E2E suite passed all 152 cases, including visible
calendar focus, cell bounds, financial feedback, disabled controls and error/retry
navigation. Local static checks, unit/integration tests and migration verification
also passed. Pixel equality was deliberately not used as the acceptance criterion;
the intended changes are the normalized typography, control defaults, palette and
border-box geometry described above. The GitHub `Quality checks` aggregate remains
a separate PR gate.

### Dialog UI maintenance

`ui/dialog/**` and `ui/alert-dialog/**` contain the acquired Dialog UI. The
acquisition command, CLI, registry and unmodified hashes are recorded separately
in `tooling/shadcn/dialog-source.json`; the basic-UI acquisition remains intact.
Repeat acquisition in a disposable directory following the procedure below,
using `add dialog alert-dialog --no-deps-install --yes --overwrite`. Overwrite is
only for staging: this command also regenerates its Button dependency. Do not
copy that Button, dependency range updates or generated theme changes back over
the existing basic UI. The CLI version does not pin the live registry.

Current local changes and contracts:

- Content owns exactly one Portal and Overlay. Its `class`, `overlayClass` and
  `portalProps` are forwarded independently. Root, native refs, heading levels,
  attributes and lifecycle/event callbacks pass through the wrappers.
- The generated automatic X button is omitted. Callers own explicit close
  controls and availability; in particular, day-entry saving prevents closing,
  while the responsive settings/create panel retains its own close behavior.
- Dialog Content uses one scroll owner, the existing surface tokens and a
  centered desktop layout. At `max-width: 760px` it becomes a bottom sheet with
  dynamic viewport height and safe-area padding. Use the exact media query,
  since Tailwind's `max-[760px]` is strictly less than 760px and would disagree
  with the application's `MediaQuery` at the boundary.
- The surface class constant is shared locally by Dialog and AlertDialog.
  Overlay/content layers are 50/51 and 60/61 respectively, so a boundary alert
  remains above an open settings sheet. AlertDialog stays centered on mobile.
- Title/Description styles use existing tokens. Action/Cancel use the existing
  `buttonVariants` from `ui/button/button.svelte`, merged through `cn`; Action
  does not close before the controlled confirmation finishes. Cancel receives
  initial focus, and caller-owned close autofocus remains authoritative.
- Imports have explicit `.ts` / `.svelte` extensions. Wrapper prop omissions
  use local `Omit` types. Unused Header/Footer/Media/Trigger parts, duplicate
  barrel aliases, animation classes and extra dependencies are omitted.
  No Sheet package or separate swipe-dismiss behavior is needed for the shared
  responsive Dialog presentation.

Business components still own session lifetime, saving guards and focus recovery.
Keep day-entry's conditional mount and date key, and keep desktop
`details`/`summary` in `ResponsiveActionPanel`. The old shared
`dialog-surface.css` is removed; the remaining day-entry and disclosure CSS owns
only their local content, status and marker behavior. Do not restore global
surface rules that compete with the acquired UI utilities.

Before accepting an update, run the day-entry surface/mobile/session/history
race, mobile-action-sheet and boundary-confirmation scenarios, including
GET-only recovery. `dashboard-dialog-adapters.spec.ts` covers resize across
760/761px, retained drafts, single forms, nonsaving outside-click suppression,
focus traps and nested alerts. Inspect desktop/mobile height, scrolling, focus
and stacked surfaces, then run all required gates.

### Basic UI maintenance

`src/lib/components/ui/**` is project-owned source acquired from shadcn-svelte,
not an installed component library. `components.json` selects Vega, Lucide and
the existing `src/app.css`. Its neutral base-color setting is acquisition
metadata, not a replacement for the application palette. The upstream MIT notice
is retained in `tooling/shadcn/LICENSE.md`.

`tooling/shadcn/source.json` records the CLI version, registry, acquisition date,
command and SHA-256 hashes of the unmodified generated files. A pinned CLI does
not pin the live registry. Record a new acquisition separately and review both
upstream differences and local adaptations before updating these hashes.

To acquire or update components:

1. Use the repository-defined Node/pnpm versions and a disposable directory with
   the same package imports, TypeScript/Vite configuration, `src/app.css`,
   `components.json` and installed project dependencies. Run `pnpm exec svelte-kit
sync` there. Do not copy `.dev.vars`, credentials or local D1 state.
2. Use the recorded CLI version with `pnpm dlx shadcn-svelte@<cliVersion> add
utils button input card textarea label native-select --cwd <staging>
--no-deps-install --yes`. The flag prevents installation, but still writes
   generated files and changes the staging package manifest. Avoid `init` and
   preset application on the application checkout: they can replace theme CSS
   and introduce unrelated dependencies.
3. Compare the generated files and package changes against the previous source
   hashes and the current implementation. Keep existing dependency ranges unless
   the component needs an intentional update. Initial acquisition proposed a
   Lucide update; #582 retained the application's existing version instead.
4. Normalize local generated imports to actual `.ts` / `.svelte` paths. Keep
   `aliases.utils` extensionless (`#lib/utils`): the CLI appends `.js`, which must
   become `.ts`, rather than producing `.ts.js`. The CLI resolves `#lib/*` from
   `package.json`; do not restore `svelte.config.js` or duplicate `tsconfig.paths`.
   Check for unresolved `$LIB$` / `$UTILS$` placeholders, `IconPlaceholder` and
   `cn-font-heading` markers. Copying raw upstream templates skips the required
   icon/style transforms.
5. Reapply the local changes below, retain only consumed component parts and
   exports, format, and run all required gates. Inspect desktop/mobile states,
   SSR/hydration, keyboard focus and the error/retry path before accepting an
   update. Fallow continues to analyze `ui/**`; do not exclude it or baseline new
   findings to accommodate unused generated scaffolding.

Current local adaptations:

- `cn` merges utility classes; Button uses `tailwind-variants/lite` for variants
  so class merging has one owner. Both are application dependencies. Existing
  Bits UI and Lucide dependencies are reused. These six components do not need
  `tw-animate-css` or `shadcn-svelte/tailwind.css`.
- Imports use `#lib` and explicit extensions. Unused Card parts, Native Select
  OptGroup, duplicate barrel aliases and unused utility types are omitted.
- Button renders a native button with explicit caller-provided submit/button
  intent. Its ref is `HTMLButtonElement`; Input, Textarea and Native Select
  expose their actual DOM elements through `bind:ref`. `WithElementRef` leaves
  its element parameter unconstrained because this application combines DOM
  and Worker declarations; each interactive control specifies its native type.
- Input/textarea retain native value/event forwarding. The file and ordinary
  Input branches share one class calculation. Utility types use `unknown`
  rather than introducing lint suppressions.
- The existing light theme supplies input fills, borders, control height and
  Card shadow/spacing. Default buttons retain a 44px minimum target height.
  Unused dark variants are removed. Native Select dims its
  control once, instead of compounding wrapper/control opacity. Card does not
  clip keyboard outlines. `aria-disabled` styling never adds native disabling
  or suppresses events; guarded business handlers still decide availability.

Business components keep raw text, validation, labels, Japanese wording, test
IDs, refs and controller orchestration. In particular, `readonly` missing-history
fields remain selectable, day-entry drafts remain editable while saving, and
retry buttons can retain focus while `aria-disabled`. Card wrappers preserve
native labelled sections and heading levels. The period header binds a local
selection draft and reconciles it when loading finishes; a failed switch must
reset the binding as well as the DOM value before later option-list refreshes.
The money-input group owns its
unclipped focus outline. Remove superseded primitive CSS locally, including
responsive/state declarations, when moving a control into `ui/**`.

The focused `dashboard-basic-controls.spec.ts` covers native select label and
keyboard behavior plus amount focus bounds and forwarded values at narrow and
desktop widths. Existing settings/create, period-operation/switch, history/race,
range-picker and framework-error-retry specs cover the surrounding contracts.
Dialog/AlertDialog/Sheet primitives remain owned by #583; RangeCalendar and
budget-calendar cells/navigation remain owned by #584. Those migrations can use
the established `class`, `variant`, native attributes, `bind:value` and `bind:ref`
APIs without changing the shared theme or utilities.
For wrappers around an existing primitive, `ui/button/button.svelte` also
exports `buttonVariants`, `ButtonVariant` and `ButtonSize`; combine the returned
classes with `cn` when accepting caller classes. Keep new wrapper-specific prop
omissions local with TypeScript's `Omit` rather than adding unused utility types
to the shared module solely to match an upstream barrel.

### Range calendar maintenance

`ui/range-calendar/**` owns the shadcn-svelte presentation and the internal Bits UI
boundary. `PeriodRangeCalendar.svelte` adapts its native start/end/complete callbacks
to the period form, using `period-range-selection.ts`. The picker still owns raw
text conversion, and `period-range-state.ts` owns parsing and validation.

The acquisition command, CLI/style settings and untouched generated file hashes
are recorded in `tooling/shadcn/range-calendar-source.json`. Follow the isolated
acquisition workflow above, substituting `add range-calendar` and using
`--overwrite` only in the disposable staging directory. The CLI also generates a
Button dependency and proposes manifest changes: compare these, but preserve the
application's existing Button, utilities, dependency versions and theme. Never
copy a whole generated dependency tree onto the application checkout.

Local adaptations to retain on updates:

- Keep imports explicit, using `#lib/utils.ts` and the existing
  `ui/button/button.svelte` variant exports. Use local `Omit` types for snippet
  omissions rather than expanding shared utilities.
- Keep only consumed parts. The application uses a heading with previous/next
  controls; caption dropdowns, month/year selects and their unused containers or
  barrel exports are omitted. Previous/next buttons share one direction-based
  wrapper while retaining each primitive's behavior. Its child snippet applies
  the Japanese label after the primitive's props on the native button, so the
  default English label cannot overwrite it. Combine the caller's disabled state
  with the primitive's boundary restriction on that native button, including its
  ARIA/data disabled attributes. An explicit focus outline style
  overrides the base Button's `outline-none`. The shared component forwards native
  root props, value/placeholder bindings and all three selection callbacks.
- Preserve `ja-JP`, one month, short weekdays, fixed weeks, prevent-deselect and
  the Japanese navigation labels at the business adapter. The shared heading
  uses the primitive's locale formatting. The DOM order remains manual inputs,
  previous month, next month, then the active day.
- The table fills available width. Day controls have at least the existing 42px
  height, with an inset keyboard outline using `--focus-range`. Focused endpoints
  use `--primary-foreground` for a clear outline against their primary background.
  The existing semantic tokens own selection, endpoints, today, disabled text and
  focus; no dark theme or animation dependency is required. Styles are local to
  the acquired components, not global selectors targeting every
  `[data-range-calendar-*]` element.
- Preserve partial publication immediately after a new start. Matching complete
  values are published only after the start/end callbacks agree. Re-selecting the
  same start retains the existing microtask so the final end callback in that
  turn can distinguish clearing from same-day completion. Parent range updates
  synchronize the adapter; raw invalid input and disabled state remain owned by
  the form. Do not replace this contract with only `onValueChange` or add another
  deferred notification layer.

`period-range-selection.test.ts` protects publication order, stale complete values,
parent resets and disabled state. `period-range-picker.spec.ts` covers raw input,
partial/same-day selection, repeated starts, rapid ranges, keyboard navigation,
parent period changes and mobile dimensions. For an upstream update, compare the
actual browser callback and publication sequences before and after the change,
then run the focused calendar/settings/create/boundary E2E and all quality gates.
Temporary measurement hooks must not be added to product routes or controllers.

The budget display calendar remains a separate native-button implementation.
Its roving tabindex, selected/focused date, `aria-disabled`, month navigation and
day-presentation rules stay with that component. Surface, hover, today, selection
and financial colors use the existing tokens. Weekend colors and complex cell
geometry remain local; a recorded expenditure does not introduce a new
overspending classification. Dialog and sheet behavior is owned by #583.

## Verification

Format files before opening a review:

```bash
pnpm format
pnpm format:check
```

Lint source, test, and config files:

```bash
pnpm lint
```

Run focused checks while developing. CI uses warning-strict static-analysis commands:

```bash
pnpm format:check
pnpm lint:ci
pnpm check:ci
pnpm fallow:ci
pnpm db:verify
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
```

Required CI gate policy:

- Pull request / `main` push CI runs `pnpm format:check`, `pnpm lint:ci`, `pnpm check:ci`, `pnpm fallow:ci`, `pnpm db:verify`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, and `pnpm test:e2e`.
- CI executes independent checks in parallel, then reports the aggregate `Quality checks` job after all required jobs succeed.
- Renovate update branch pushes do not run CI directly. Renovate creates PRs immediately after any required Dependency Dashboard approval, and pull request CI is the authoritative validation gate.
- The optional `E2E` GitHub Actions workflow remains available through `workflow_dispatch` for manual Playwright checks.
- Coverage is intentionally a visibility check, not a required PR gate. Run `pnpm test:coverage` when changing server-side domain, API, repository, or validation behavior.

### Static analysis policy

`pnpm lint` and `pnpm check` remain the development commands. `pnpm lint:ci`
adds ESLint's `--max-warnings=0`; `pnpm check:ci` adds svelte-check's
`--fail-on-warnings` after the same SvelteKit sync. CI rejects any ESLint or
Svelte/TypeScript diagnostic warning, including warning-level rules inherited
from the recommended presets. Tool/environment messages outside those diagnostic
systems (for example, Wrangler's proxy notice) are not covered by these flags.

The initial inventory at `c1d12e4` had zero ESLint errors/warnings and zero
svelte-check errors/warnings. No warning baseline, warning budget, or blanket
suppression is introduced. Dependency updates must pass the same gate; investigate
new diagnostics rather than relaxing it for Renovate.

Project rules for `.svelte`, `.svelte.ts` and `.svelte.js` files:

- `svelte/require-each-key: error`: preserve item identity across list updates.
- `svelte/button-has-type: error`: make form submission behavior explicit.
- `svelte/no-unused-props: error`: retain the recommended preset's existing error
  level instead of downgrading it to the warning level considered in #234. Keep
  its default imported-type handling; shared DTOs and forwarded component APIs
  should not be narrowed merely because one component does not use every field.
- `svelte/prefer-const: error`: use the Svelte-aware replacement, which understands
  `$props` and `$derived`. Disable core `prefer-const` only for these Svelte files;
  ordinary TypeScript files retain the core check.
- `svelte/prefer-svelte-reactivity: error`: use reactive built-ins for mutable UI
  state. Immutable lookup collections and a Map rebuilt by `$derived` remain
  valid. The history controller's `mutationSequences` Map is an explicitly
  documented, single-declaration exception: it tracks imperative request ordering,
  not rendered state. Making those race guards reactive is unnecessary.

Candidate-rule analysis required no runtime or component API changes. The only
reactivity finding was that request-order Map (reported twice by the plugin).
ESLint configuration comments also explain the existing TypeScript unused-variable
replacement and the narrow Drizzle/D1 `no-explicit-any` exceptions. If an intentional
API or a false positive needs a future exception, keep it local, name the rule,
explain the reason, and add regression coverage. Do not disable a rule globally to
make CI pass.

### Fallow structural analysis

Run `pnpm fallow` for the combined raw report, or `pnpm fallow:dead-code`,
`pnpm fallow:dupes`, and `pnpm fallow:health` separately. `pnpm fallow:ci` runs the
same baseline-aware gate as the dedicated **Fallow** job. New dead-code, duplication
and health findings, stale baseline entries and tool/parse failures fail the gate.
`Quality checks` requires Fallow success alongside every existing gate; cancelled
or skipped required jobs are not success. ESLint and svelte-check remain required.
The [operation and exception policy](tooling/fallow/README.md) documents the
reviewed #353 baseline, raw-report limitations, reports and failure investigation.
Only `fallow:ci` explicitly loads the baselines. Do not add findings, relax thresholds,
suppress whole files or run autofix in CI to obtain a pass.

### E2E timing and baseline

Local and hosted E2E use the [fixed container runner](tooling/ci/container-e2e.md).
The normal Node/pnpm development environment and non-E2E CI are unchanged. Run
`pnpm test:e2e` from a secret-free checkout with Docker/BuildKit available; examples
and a dedicated worktree procedure are documented there. CI/manual workflows use
the same wrapper with shards `1/2` and `2/2`. The internal `test:e2e:worker` script
runs Playwright only inside that container. One worker, local D1 migrations/reset
and the existing browser/headless settings remain mandatory.

The official Playwright/Node images use digest pins, Node/pnpm definitions are
reused, and the resolved Playwright lock version must match the image. Japanese
fonts, browser version and FFmpeg video are smoke-tested before building. Each
shard installs, builds and tests in the same container/path. Image tar/gzip cache
and comparison snapshot artifacts are not used; Actions caches only the pnpm
store. See the runner guide for distribution/authentication limits and updates.

`YOSAN_FLOW_E2E_PREBUILT=1` is set only inside the CI container after a successful
same-container build. The original SHA/run/attempt/job/cwd/Node/environment/output
and timing guards remain intact. A local invocation uses the original build path;
do not set this CI-only flag manually. Generated output is never shared across
shards, and each shard owns its disposable local D1. Revert this migration as a
reviewed change for rollback; do not relax the prebuild or reset guards.

Both CI and the manual E2E workflow run shards `1/2` and `2/2` on independent hosted runners, with one Playwright worker and runner-local Wrangler/D1 state per shard. `fail-fast: false` lets the other shard finish after a failure, and `Quality checks` requires both CI shards to succeed. The **E2E timing summary** runs after both shards complete and publishes a separate section for each shard. Open the workflow run's summary or the `Summarize completed E2E job` log for timing, outcome counts and the five slowest individual tests in each shard.

- **Job** is the completed E2E job's `completed_at - started_at`, excluding queue time and the dependent summary job. It includes the measurement upload.
- **E2E step** is the existing `pnpm test:e2e` step interval. Every other completed step has its own interval; their sum need not equal job wall-clock.
- **Startup** is build start to Playwright's HTTP-ready observation. It includes build, any remaining parallel browser-install wait, D1 migrations, server startup, HTTP detection and the handoff to global setup. CI records **E2E application build** separately; the local build path leaves that optional metric unavailable.
- **Playwright** is the JSON report's `stats.duration`. **Attempts** sums every individual test/project entry's attempt durations, including retries. The top five rank those individual entries by their summed durations.
- Counts use final report outcomes: expected, unexpected/failed, flaky and skipped. A test that passes after a failed attempt is flaky, not an additional failed test.

All durations are reported in seconds. These measurements overlap and must not be added together. Missing test reports or incomplete startup produce `Unavailable`, while valid zero-test reports remain zero. Collection or malformed-data errors fail the summary job without changing the E2E job's result, after allowing the other shard's summary to run. Ordinary failures retain the existing JSON/HTML/Wrangler diagnostics; the timing artifact contains only `test-results/results.json` and `.tmp-e2e-timing.json`. Artifact names include the run ID, attempt and `-shard-1` or `-shard-2`; each shard is downloaded into its own directory. Both artifact types have seven-day retention. A forcibly cancelled workflow may not publish them.

The following pre-optimization baseline was collected sequentially on 2026-09-12 from the manual workflow on `codex/issue-339-e2e-timing`, frozen at [`cd14999`](https://github.com/sh4869221b/yosan-flow/commit/cd14999). All five attempted runs and their summary jobs succeeded on attempt 1, with no failed runs, reruns or exclusions. Each ran the same 112 tests with one worker and unchanged Playwright startup, retry, reset and diagnostic settings. Every run reported 112 expected, 0 failed, 0 flaky and 0 skipped. Runtime/dependency versions are defined by `.node_version`, `package.json#packageManager` and `pnpm-lock.yaml` at that revision.

| Run / top-five summary                                                                                                                                                           | Attempt | Tests | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ----: | ------: | -----------: | ----------: | -------------: | -----------: |
| [34678769143](https://github.com/sh4869221b/yosan-flow/actions/runs/34678769143) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34678769143/job/103513865937) |       1 |   112 |     272 |          212 |      21.155 |        208.740 |      182.858 |
| [34679019837](https://github.com/sh4869221b/yosan-flow/actions/runs/34679019837) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679019837/job/103514518245) |       1 |   112 |     253 |          208 |      21.862 |        205.759 |      180.392 |
| [34679264375](https://github.com/sh4869221b/yosan-flow/actions/runs/34679264375) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679264375/job/103515128269) |       1 |   112 |     226 |          178 |      14.689 |        176.194 |      157.687 |
| [34679478967](https://github.com/sh4869221b/yosan-flow/actions/runs/34679478967) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679478967/job/103515797585) |       1 |   112 |     246 |          205 |      21.252 |        202.727 |      177.972 |
| [34679722298](https://github.com/sh4869221b/yosan-flow/actions/runs/34679722298) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34679722298/job/103516476556) |       1 |   112 |     248 |          201 |      20.508 |        199.109 |      175.201 |
| **Median**                                                                                                                                                                       |         |       | **248** |      **205** |  **21.155** |    **202.727** |  **177.972** |

The median is the third sorted observation for each metric, computed before rounding. Remaining E2E job step intervals below use runs 1–5 in the same order as above; `Run E2E tests` is already listed in the main table.

| Step (seconds)                   | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
| -------------------------------- | ----: | ----: | ----: | ----: | ----: | -----: |
| Set up job                       |     1 |     1 |     2 |     1 |     2 |      1 |
| Check out repository             |     1 |     1 |     1 |     1 |     1 |      1 |
| Set up pnpm                      |     9 |     5 |     8 |     5 |     5 |      5 |
| Set up Node.js                   |    10 |     9 |     7 |     8 |     9 |      9 |
| Install dependencies             |     3 |     3 |     3 |     3 |     3 |      3 |
| Install Playwright browser       |    30 |    22 |    24 |    19 |    22 |     22 |
| Upload E2E diagnostics (skipped) |     0 |     0 |     0 |     0 |     0 |      0 |
| Upload E2E timing                |     1 |     1 |     1 |     1 |     1 |      1 |
| Post Set up Node.js              |     0 |     0 |     0 |     0 |     1 |      0 |
| Post Set up pnpm                 |     0 |     0 |     0 |     0 |     0 |      0 |
| Post Check out repository        |     1 |     0 |     0 |     1 |     0 |      0 |
| Complete job                     |     0 |     0 |     0 |     0 |     0 |      0 |

#### Per-test warm-up removal (#340)

The following ten sequential manual E2E runs were collected on 2026-09-12 from `codex/issue-340-remove-e2e-warmup`, frozen at implementation revision [`6bb3b48`](https://github.com/sh4869221b/yosan-flow/commit/6bb3b48). They use the same 112-test suite, `ubuntu-latest` runner label, one worker, dependency definitions and startup/retry/reset/diagnostic settings as the #339 baseline above. The implementation removes the separate-page warm-up and its fixed 500ms wait before each test. This measurement record was added afterward in a documentation-only commit; no implementation, test, configuration or dependency changes occurred during the sequence.

All ten attempted hosted runs and their summary jobs succeeded on attempt 1: each reported 112 expected, 0 failed, 0 flaky and 0 skipped, with no test retries, failed runs, reruns or exclusions. Dispatching paused for about 2.5 hours between runs 5 and 6 because of an agent usage limit; no workflow was interrupted. Every run's first test, `updates a seeded period budget`, passed. Each run also logged 116 database resets, all with zero rows afterward in `budgetPeriods`, `dailyOperationHistories` and `dailyTotals`, including resets with nonzero rows beforehand in all three tables.

| Run / top-five summary                                                                                                                                                           | Attempt | Tests | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ----: | ------: | -----------: | ----------: | -------------: | -----------: |
| [34681246460](https://github.com/sh4869221b/yosan-flow/actions/runs/34681246460) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681246460/job/103520504221) |       1 |   112 |     178 |          136 |      20.885 |        133.753 |      109.467 |
| [34681433950](https://github.com/sh4869221b/yosan-flow/actions/runs/34681433950) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681433950/job/103521002533) |       1 |   112 |     179 |          127 |      16.028 |        124.675 |      104.605 |
| [34681604777](https://github.com/sh4869221b/yosan-flow/actions/runs/34681604777) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681604777/job/103521478106) |       1 |   112 |     182 |          135 |      20.483 |        133.100 |      109.331 |
| [34681784095](https://github.com/sh4869221b/yosan-flow/actions/runs/34681784095) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681784095/job/103521947444) |       1 |   112 |     182 |          134 |      20.613 |        131.636 |      107.752 |
| [34681953797](https://github.com/sh4869221b/yosan-flow/actions/runs/34681953797) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34681953797/job/103522448690) |       1 |   112 |     196 |          142 |      20.880 |        139.537 |      115.391 |
| [34688332655](https://github.com/sh4869221b/yosan-flow/actions/runs/34688332655) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688332655/job/103539451364) |       1 |   112 |     160 |          117 |      15.873 |        115.484 |       97.011 |
| [34688535031](https://github.com/sh4869221b/yosan-flow/actions/runs/34688535031) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688535031/job/103540005506) |       1 |   112 |     172 |          133 |      19.824 |        130.368 |      107.289 |
| [34688721765](https://github.com/sh4869221b/yosan-flow/actions/runs/34688721765) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688721765/job/103540475502) |       1 |   112 |     170 |          119 |      16.841 |        117.657 |       96.979 |
| [34688895903](https://github.com/sh4869221b/yosan-flow/actions/runs/34688895903) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34688895903/job/103540923152) |       1 |   112 |     176 |          137 |      20.836 |        133.717 |      109.548 |
| [34689063054](https://github.com/sh4869221b/yosan-flow/actions/runs/34689063054) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34689063054/job/103541379821) |       1 |   112 |     190 |          141 |      21.149 |        138.953 |      113.319 |

Each candidate median averages the fifth and sixth sorted raw observations before rounding. Differences use `candidate median - baseline median` and `(candidate median / baseline median - 1) * 100`; negative values mean faster. Values below are rounded to three decimal places.

| Metric     | #339 baseline median (s) | #340 median (s) | Difference (s) | Difference (%) |
| ---------- | -----------------------: | --------------: | -------------: | -------------: |
| Job        |                  248.000 |         178.500 |        -69.500 |        -28.024 |
| E2E step   |                  205.000 |         134.500 |        -70.500 |        -34.390 |
| Startup    |                   21.155 |          20.548 |         -0.607 |         -2.869 |
| Playwright |                  202.727 |         132.368 |        -70.359 |        -34.706 |
| Attempts   |                  177.972 |         108.542 |        -69.431 |        -39.012 |

The measured E2E step median decreased by 70.5 seconds. Hosted-runner variation and the dispatch pause limit attribution of the entire difference to warm-up removal. The overlapping metrics remain separate; these results do not establish the parent epic's overall performance target.

#### Two isolated shards (#341)

Five consecutive manual workflow attempts were dispatched sequentially on 2026-09-12 from `codex/issue-341-e2e-two-shards`, fixed at [`d23fb85`](https://github.com/sh4869221b/yosan-flow/commit/d23fb85). All five attempts and their summary jobs succeeded on attempt 1, without retries, reruns, exclusions or changes during the series. The later documentation commit leaves the measured implementation unchanged. Runtime/dependency versions remain defined by `.node_version`, `package.json#packageManager` and `pnpm-lock.yaml` at that revision.

Every actual report's file, full test title and project tuples matched its assigned inventory: shard 1 ran 58 tests and shard 2 ran 54, with no overlap and a union equal to the complete 112-test inventory. Each shard used one worker with `fullyParallel: false`. All results were expected, with 0 failed, flaky or skipped tests and one successful attempt per test. Distinct runner IDs, separate build logs and startup timing confirm independent execution of the unchanged build/migration/server sequence. Each run logged 58 D1 resets per shard (116 total), all with zero rows afterward in `budgetPeriods`, `dailyOperationHistories` and `dailyTotals`; 56/57 resets respectively had nonempty tables beforehand.

**Job envelope** is the latest shard job completion minus the earliest shard job start, excluding queue time and the summary job. **E2E step envelope** uses the same calculation on the two `Run E2E tests` steps. **Start skew** is the difference between their start timestamps. Neither envelope sums shard durations or overlapping startup/Playwright measurements.

| Run / per-shard top-five summary                                                                                                                                                 | Attempt | Job envelope (s) | E2E step envelope (s) | Job start skew (s) | E2E step start skew (s) |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ---------------: | --------------------: | -----------------: | ----------------------: |
| [34691034561](https://github.com/sh4869221b/yosan-flow/actions/runs/34691034561) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691034561/job/103546459391) |       1 |              144 |                   103 |                  0 |                      12 |
| [34691177405](https://github.com/sh4869221b/yosan-flow/actions/runs/34691177405) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691177405/job/103546899283) |       1 |              157 |                   114 |                  1 |                      33 |
| [34691338220](https://github.com/sh4869221b/yosan-flow/actions/runs/34691338220) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691338220/job/103547267091) |       1 |              135 |                    93 |                  1 |                      23 |
| [34691504391](https://github.com/sh4869221b/yosan-flow/actions/runs/34691504391) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691504391/job/103547695852) |       1 |              128 |                    85 |                  0 |                       4 |
| [34691666870](https://github.com/sh4869221b/yosan-flow/actions/runs/34691666870) / [summary](https://github.com/sh4869221b/yosan-flow/actions/runs/34691666870/job/103548144698) |       1 |              134 |                    84 |                  0 |                       1 |

The following per-shard values use the same run order. Outcomes are `expected / failed / flaky / skipped`; all durations are seconds, rounded only for display.

| Run | Shard | Outcomes       | Job (s) | E2E step (s) | Startup (s) | Playwright (s) | Attempts (s) |
| --: | ----: | -------------- | ------: | -----------: | ----------: | -------------: | -----------: |
|   1 |   1/2 | 58 / 0 / 0 / 0 |     144 |           91 |      18.178 |         89.303 |       67.577 |
|   1 |   2/2 | 54 / 0 / 0 / 0 |     124 |           83 |      21.204 |         80.928 |       57.264 |
|   2 |   1/2 | 58 / 0 / 0 / 0 |     116 |           73 |      17.720 |         70.644 |       50.641 |
|   2 |   2/2 | 54 / 0 / 0 / 0 |     157 |           81 |      20.562 |         79.264 |       56.314 |
|   3 |   1/2 | 58 / 0 / 0 / 0 |     134 |           70 |      15.793 |         68.459 |       48.854 |
|   3 |   2/2 | 54 / 0 / 0 / 0 |     123 |           82 |      20.682 |         79.691 |       56.586 |
|   4 |   1/2 | 58 / 0 / 0 / 0 |     128 |           81 |      20.475 |         78.373 |       53.758 |
|   4 |   2/2 | 54 / 0 / 0 / 0 |     122 |           81 |      20.531 |         78.077 |       55.127 |
|   5 |   1/2 | 58 / 0 / 0 / 0 |     131 |           80 |      20.553 |         78.370 |       54.697 |
|   5 |   2/2 | 54 / 0 / 0 / 0 |     134 |           84 |      21.096 |         81.351 |       57.804 |

Each five-run envelope median is the third sorted raw observation. Differences use `candidate - baseline` and `(candidate / baseline - 1) * 100`, rounded to three decimals after calculation. The #340 baseline used one runner, so its job and step durations correspond to the candidate envelopes.

| Metric   | #340 baseline median (s) | #341 envelope median (s) | Difference (s) | Difference (%) |
| -------- | -----------------------: | -----------------------: | -------------: | -------------: |
| Job      |                  178.500 |                  135.000 |        -43.500 |        -24.370 |
| E2E step |                  134.500 |                   93.000 |        -41.500 |        -30.855 |

Both measured medians improved, with no observed failures or retries in this five-run sample. Hosted-runner variability remains visible: job starts differed by at most one second, while E2E step starts differed by up to 33 seconds after setup. Both runners independently pay installation, build, migration and startup costs, so lower elapsed time does not imply lower total runner usage. These observations do not establish the parent epic's overall target or justify spec balancing or build reuse by themselves.

Failure handling was checked separately before measurement: [fault CI 34690734637](https://github.com/sh4869221b/yosan-flow/actions/runs/34690734637) deliberately exited 1 only in shard 1 after its 58 tests passed. Shard 2 completed all 54 tests, both timing artifacts and summary sections were produced, shard 1 uploaded JSON/HTML/Wrangler diagnostics, and `Quality checks` failed. This synthetic step failure did not generate a test-failure trace. The injection was then removed through an ordinary commit; [restored CI 34690902845](https://github.com/sh4869221b/yosan-flow/actions/runs/34690902845) passed both shards, the summary and all required quality checks. Neither CI run belongs to the five-run sample.

For historical context, these successful main CI runs predate instrumentation. Their test counts differ, so this heterogeneous sample is unsuitable for a controlled speedup comparison. Historical startup and full JSON measurements are unavailable; the old job duration also excludes the new measurement upload.

| Historical run                                                                   | Tests | Job (s) | E2E step (s) |
| -------------------------------------------------------------------------------- | ----: | ------: | -----------: |
| [34676579279](https://github.com/sh4869221b/yosan-flow/actions/runs/34676579279) |   112 |     241 |          199 |
| [34674096987](https://github.com/sh4869221b/yosan-flow/actions/runs/34674096987) |   110 |     234 |          187 |
| [34671516626](https://github.com/sh4869221b/yosan-flow/actions/runs/34671516626) |   107 |     278 |          218 |
| [34656281461](https://github.com/sh4869221b/yosan-flow/actions/runs/34656281461) |    97 |     230 |          175 |
| [34653021763](https://github.com/sh4869221b/yosan-flow/actions/runs/34653021763) |    87 |     182 |          143 |
| **Median**                                                                       | mixed | **234** |      **187** |

## Dependency Updates

Renovate is configured by `renovate.json`.

- The Dependency Dashboard Issue is enabled for visibility and manual approval.
- npm package updates wait until the released version is at least 3 days old before Renovate creates an update branch or PR. `pnpm-workspace.yaml` also enforces the same 3-day minimum release age for direct and transitive dependencies during install.
- A Renovate-only formatting workflow runs `pnpm install --frozen-lockfile` and `pnpm format` on Renovate PR branches, then commits formatter changes back to the PR branch when dependency updates change formatter output.
- Stable patch/minor updates use immediate PR creation, so CI runs on the pull request instead of a temporary Renovate branch.
- Major updates and current `0.x` dependencies require Dependency Dashboard approval before Renovate creates the branch or PR.
- Core dependencies still require Dependency Dashboard approval for major updates, but their patch/minor updates create PRs automatically after the 3-day release age gate.
- Core dependencies are framework/runtime/deployment/database/UI and quality-gate dependencies that can change app behavior, build output, Cloudflare deployment, DB access, or the main dashboard component surface.

Run E2E locally when a change affects browser workflows:

```bash
pnpm test:e2e
```

Playwright applies local D1 migrations before starting the local Wrangler server, then resets D1 data before each test through a guarded E2E-only endpoint.

Check unit/integration coverage for server and API code:

```bash
pnpm test:coverage
```

### Migration policy

`src/lib/server/db/schema.ts` is the canonical schema for future changes. Generate
SQL and metadata with the repository-pinned Drizzle Kit; apply SQL with Wrangler.
Application queries remain behind Drizzle/repositories, with no runtime migrator
or request-time schema bootstrap. Never use Drizzle `push` or `migrate` against D1.

#### Baseline and history ownership

- Keep `migrations/0001_initial.sql` and `0002_reset_to_budget_periods.sql` byte-for-byte
  unchanged at their existing paths. They remain executable historical artifacts,
  not files to regenerate from the new source of truth. `0002` deletes tables/data.
- `20261002021516_legacy_baseline.sql` contains only the read-only `SELECT 1` statement.
  Its Drizzle `meta/20261002021516_snapshot.json` was generated from the unchanged schema;
  only the generated initial SQL was replaced with the no-op during this one-time
  adoption. Never regenerate this baseline or apply the discarded initial CREATEs.
- Drizzle's `_journal.json` starts at index 0 for this baseline. It intentionally
  does not claim the two legacy files. Preserve journal/snapshot IDs and history.
  Wrangler separately records every applied SQL filename in `d1_migrations`.
- All D1 bindings explicitly use `migrations_dir: "migrations"` and the flat
  `migrations/*.sql` pattern. Drizzle's timestamp prefix sorts numerically after
  `0001` and `0002`; metadata JSON is never applied by Wrangler. Never switch back
  to index prefixes, move files, or use `wrangler d1 migrations create` alongside
  Drizzle generation. Generate sequentially; verify filenames and journal order
  after parallel branch work or timestamp collisions before applying anything.

The baseline records the existing Drizzle model, not a re-introspection or
normalization of legacy DDL. In particular, legacy SQLite `TEXT PRIMARY KEY` on
`budget_periods.id` and `daily_operation_histories.id` has `notnull = 0`; Drizzle's
`.primaryKey()` models these as non-null. Legacy CHECK constraints are unnamed,
whereas the model gives them names. No table is rebuilt and these physical details
remain unchanged here. A future generated table recreation may introduce explicit
`NOT NULL` or change constraint representation: review it against the actual
legacy schema and data, including nullable legacy IDs, before approving that
separate schema change. Do not treat snapshot equality as physical-schema equality.

#### Create, review, and verify

1. Change `schema.ts`, then run `pnpm db:generate --name describe_schema_change`.
   For data-only/custom SQL, use `pnpm db:generate:custom --name describe_data_change`
   and fill in its SQL. Do not edit an already applied migration.
2. Review and commit the SQL, corresponding snapshot and journal together. Check
   table recreation, copy/rename/drop operations, defaults, nullability, CHECKs,
   indexes (including DESC ordering), composite PKs, FKs and preservation of rows,
   values and rowids. History replay uses `created_at ASC, rowid ASC`, so preserve
   same-timestamp ordering during table copies. Custom SQL must preserve or
   deliberately reconcile schema metadata;
   use schema-generated SQL for representable DDL.
3. Run `pnpm db:check`. This checks Drizzle metadata consistency, not live drift,
   missing generated migrations or data safety. Running `pnpm db:generate` again
   on an unchanged schema should report no changes and write nothing. Generated
   IDs/timestamps are not deterministic across independent new migrations, so do
   not compare their raw bytes as a general regeneration gate.
4. Verify both an empty disposable DB (legacy → baseline → new SQL) and a disposable
   DB with both legacy migrations already recorded plus representative data (only
   baseline/new SQL pending). Compare schema, row counts, PK/FK integrity and values.
   Run `pnpm db:verify` for the dedicated automated checks described below.
5. Apply locally only after reviewing the pending list, then run affected integration
   tests and the existing quality checks. Use a new disposable state directory when
   testing; do not reset an existing database to simulate an upgrade.

```bash
pnpm db:check
pnpm wrangler d1 migrations list DB --local
pnpm run cf:migrate:local
pnpm test:unit
pnpm test:integration
pnpm check:ci
```

#### Migration safety gate

`pnpm db:verify` runs Drizzle metadata checks and `tests/migrations/`. The dedicated
**Migration safety** CI job is required by **Quality checks**, including when it
fails, is skipped or is cancelled. Keep the ordinary unit/integration/static/build
and E2E gates too. No database credentials or remote apply are involved.

The checks deliberately cover different failure modes:

- **History:** validate SQL/journal/snapshot correspondence and order; existing SQL
  and snapshot bytes are immutable, and old journal entries are append-only. CI
  compares against the PR base SHA or main push's previous SHA with full Git
  history. Locally it uses `git merge-base HEAD origin/main`; fetch `origin/main`
  first, or set `MIGRATION_BASE_REF` to an explicit 40-character base commit SHA.
  A missing base/history fails rather than silently skipping the guard.
- **Generation:** generate the current schema snapshot in memory with the pinned
  Drizzle API and compare its schema content to the last committed snapshot.
  Exclude only `id`, `prevId` and `_meta` rename bookkeeping; serialize undefined
  fields as Drizzle does. Keep constraints and internal expression-index metadata.
  No generated UUID/timestamp filenames or raw regenerated-file diff is used.
- **Physical schema:** apply the complete SQL chain to disposable SQLite and
  compare against a separately generated canonical schema. Inspect columns,
  defaults, composite PK/FK grouping/actions, index ordering/expressions/predicates,
  CHECK expressions, collation, generated columns, autoincrement, views/triggers,
  STRICT and WITHOUT ROWID. CHECK names are representational; only the two known
  legacy `table.id` TEXT PK nullability differences are normalized. Deferred FK
  declarations and explicit ON CONFLICT clauses currently fail closed: add explicit
  inspection and regression coverage before introducing those features.
- **Upgrade/data:** record 0001/0002 before inserting artificial linked periods,
  cross-period same-date totals, NULL IDs, Japanese/null/empty memos and sparse
  history rowids. Apply only pending migrations and compare every original column,
  key, value, row count and rowid. Exercise duplicate PK, FK and CHECK rejection.
  Intentional future data transformations require explicit fixture/expectation
  review, never weakening assertions just to obtain a pass. Additive columns are
  accepted without dropping the original-column preservation checks.
- **Runtime:** run default API/repository/atomic writer SQL through a real SQLite
  D1 adapter, and separately run actual Wrangler local D1 migrations on fresh and
  legacy-seeded state. Repeated apply must retain records/data. The adapter is not
  the D1 runtime; Wrangler/E2E coverage remains necessary.

Negative controls prove missing SQL/snapshot generation, immutable-history edits,
physical drift, row/value/rowid loss and invalid SQL fail. A generated additive
migration is a positive control. The CI aggregate's actual shell is also exercised
with success/failure/cancelled/skipped job results. All fixture databases are
in-memory or new `.tmp-migration-*` directories removed after use; no normal local
state is reset and no production data is copied. These fixtures cannot prove
safety for every existing database or replace migration review/backups.

On failure, read the specific assertion, review pending SQL and regenerate missing
metadata from `schema.ts` when appropriate. Never rewrite legacy/applied artifacts,
ignore all snapshot differences, disable constraint checks, or loosen an existing
quality baseline to make the gate green.

For an existing local DB, inspect its recorded filenames without changing them:

```bash
pnpm wrangler d1 execute DB --local --command "SELECT name FROM d1_migrations ORDER BY id"
```

If existing data is present but either legacy migration is pending or its record
is missing, **stop** and investigate. Do not replay `0002`, delete migration history,
mark migrations applied without verifying their schema, or use `cf:reset:local` as
an upgrade. A database with only `0001` recorded is not a supported safe upgrade
fixture for this baseline because the pending `0002` is destructive.

Preview/production apply is a separately authorized operation using the existing
`cf:migrate:preview` / `cf:migrate:production` scripts, after confirming the target
binding and history. This foundation does not apply to any remote database and
adds no credentials, direct Drizzle D1 connection, runtime migrator or deployment.

If E2E needs an in-memory dev server because local D1 state is stale, start the app with:

```bash
XDG_CONFIG_HOME="$PWD/.tmp-xdg-config" YOSAN_FLOW_FORCE_IN_MEMORY_DEV=1 pnpm dev -- --host 127.0.0.1
```

## Cloudflare Deployments

Do not deploy with bare `wrangler deploy`. The top-level D1 database id in `wrangler.jsonc` is a local placeholder.

Use environment-specific scripts:

```bash
pnpm run deploy:preview
pnpm run deploy:production
```

Before preview or production deploys, confirm the matching `env.preview` or `env.production` D1 `database_id` is not `00000000-0000-0000-0000-000000000000`.

## Commit Messages

Follow the style already used in the repository:

- `feat: short description`
- `fix: short description`
- `chore: short description`
- `docs: short description`

Keep commits focused and avoid mixing unrelated formatting changes with logic changes.
