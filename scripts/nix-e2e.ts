import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { preparePnpm } from "./pnpm-e2e.ts";

const directory = resolve(".tmp-nix-e2e");
const manifest = JSON.parse(
  readFileSync(join(directory, "manifest.json"), "utf8"),
);
const paths = manifest.paths;
const browserDirectory = join(directory, "playwright");
const fontconfigFile = join(directory, "fonts.conf");
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const xml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

function link(target: string, path: string) {
  rmSync(path, { force: true });
  symlinkSync(target, path);
}

async function tools() {
  assert.equal(process.version, `v${manifest.nodeVersion}`);
  const project = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(project.packageManager, `pnpm@${manifest.pnpmVersion}`);
  const pnpmDirectory = await preparePnpm(
    project.packageManager,
    readFileSync("pnpm-lock.yaml", "utf8"),
    directory,
  );
  const bin = join(directory, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!${paths.bash}/bin/bash\nexec ${quote(join(pnpmDirectory, "pnpm"))} "$@"\n`,
  );
  chmodSync(join(bin, "pnpm"), 0o755);
  assert.equal(
    execFileSync(join(bin, "pnpm"), ["--version"], { encoding: "utf8" }).trim(),
    manifest.pnpmVersion,
  );
  const addedPaths = [
    bin,
    `${paths.node}/bin`,
    `${paths.bash}/bin`,
    `${paths.coreutils}/bin`,
    `${paths.fontconfig}/bin`,
  ];
  const environment = {
    PLAYWRIGHT_BROWSERS_PATH: browserDirectory,
    FONTCONFIG_FILE: fontconfigFile,
  };
  writeFileSync(
    join(directory, "env.sh"),
    [
      `export PATH=${quote(addedPaths.join(":"))}:"$PATH"`,
      ...Object.entries(environment).map(
        ([key, value]) => `export ${key}=${quote(value)}`,
      ),
      "",
    ].join("\n"),
  );
  if (process.env.GITHUB_PATH)
    appendFileSync(process.env.GITHUB_PATH, `${addedPaths.join("\n")}\n`);
  if (process.env.GITHUB_ENV)
    appendFileSync(
      process.env.GITHUB_ENV,
      Object.entries(environment)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
}

async function browsers() {
  const testRequire = createRequire(
    createRequire(import.meta.url).resolve("@playwright/test/package.json"),
  );
  const require = createRequire(testRequire.resolve("playwright/package.json"));
  const core = require.resolve("playwright-core/package.json");
  const packageInfo = JSON.parse(readFileSync(core, "utf8"));
  assert.equal(packageInfo.version, manifest.playwrightVersion);
  const installed = JSON.parse(
    readFileSync(join(core, "..", "browsers.json"), "utf8"),
  );
  for (const [name, expected] of [
    ["chromium-headless-shell", manifest.headlessShell],
    ["ffmpeg", manifest.ffmpeg],
  ] as const) {
    const browser = installed.browsers.find(
      (entry: { name: string }) => entry.name === name,
    );
    assert.ok(browser, `Missing Playwright browser: ${name}`);
    assert.equal(browser.revision, expected.revision);
    assert.equal(browser.browserVersion, expected.browserVersion);
    assert.ok(
      !browser.revisionOverrides,
      `Review platform overrides for ${name}`,
    );
  }
  mkdirSync(browserDirectory, { recursive: true });
  link(
    paths["headless-shell"],
    join(
      browserDirectory,
      `chromium_headless_shell-${manifest.headlessShell.revision}`,
    ),
  );
  link(
    paths.ffmpeg,
    join(browserDirectory, `ffmpeg-${manifest.ffmpeg.revision}`),
  );
  writeFileSync(
    fontconfigFile,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${xml(paths.fonts)}/share/fonts</dir>\n  <dir>${xml(paths.dejavu)}/share/fonts</dir>\n  <cachedir>${xml(directory)}/font-cache</cachedir>\n  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family><family>Noto Sans CJK JP</family></prefer></alias>\n</fontconfig>\n`,
  );
  const font = execFileSync(
    "fc-match",
    ["sans-serif:lang=ja", "--format", "%{family}"],
    { encoding: "utf8" },
  );
  assert.match(font, /Noto Sans CJK/);
  const ffmpegOutput = execFileSync(
    join(paths.ffmpeg, "ffmpeg-linux"),
    ["-version"],
    { encoding: "utf8" },
  );
  assert.match(ffmpegOutput, /ffmpeg version/);
  // Keep Playwright's existing default sandbox behavior; require no sysctl changes.
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    assert.equal(browser.version(), manifest.headlessShell.browserVersion);
    const page = await browser.newPage();
    await page.setContent(
      '<p style="font:32px sans-serif">予算・支出・日本語</p>',
    );
    await page.screenshot({ path: join(directory, "japanese-font.png") });
    assert.ok(
      await page
        .locator("p")
        .evaluate(
          (element: HTMLElement) => element.getBoundingClientRect().height > 0,
        ),
    );
    console.log(
      JSON.stringify({
        playwright: packageInfo.version,
        chromium: browser.version(),
        headlessRevision: manifest.headlessShell.revision,
        ffmpegRevision: manifest.ffmpeg.revision,
        font,
      }),
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[2] === "tools") await tools();
else if (process.argv[2] === "browsers") await browsers();
else throw new Error("Expected tools or browsers");
