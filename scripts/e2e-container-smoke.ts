import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import { containerConfig } from "./e2e-container-config.ts";

const config = containerConfig();
const require = createRequire(import.meta.url);
const testRequire = createRequire(
  require.resolve("@playwright/test/package.json"),
);
const playwrightRequire = createRequire(
  testRequire.resolve("playwright/package.json"),
);
const core = playwrightRequire.resolve("playwright-core/package.json");
for (const path of [
  require.resolve("@playwright/test/package.json"),
  testRequire.resolve("playwright/package.json"),
  core,
])
  assert.equal(
    JSON.parse(readFileSync(path, "utf8")).version,
    config.playwrightVersion,
    "Installed Playwright differs from lockfile/image",
  );
const browsers = JSON.parse(
  readFileSync(join(dirname(core), "browsers.json"), "utf8"),
).browsers;
const headless = browsers.find(
  (entry: { name: string }) => entry.name === "chromium-headless-shell",
);
const ffmpeg = browsers.find(
  (entry: { name: string }) => entry.name === "ffmpeg",
);
assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, "/ms-playwright");
assert.ok(
  existsSync(`/ms-playwright/chromium_headless_shell-${headless.revision}`),
  "Missing locked headless shell revision",
);
const ffmpegPath = `/ms-playwright/ffmpeg-${ffmpeg.revision}/ffmpeg-linux`;
assert.match(
  execFileSync(ffmpegPath, ["-version"], { encoding: "utf8" }),
  /ffmpeg version/,
);
const font = execFileSync(
  "fc-match",
  ["sans-serif:lang=ja", "--format", "%{family}"],
  { encoding: "utf8" },
);
assert.match(font, /Noto Sans CJK/);
const browser = await chromium.launch();
try {
  assert.equal(browser.version(), headless.browserVersion);
  const page = await browser.newPage({
    recordVideo: { dir: ".tmp-container-e2e/video" },
  });
  await page.setContent(
    '<p style="font:32px sans-serif">予算・支出・日本語</p>',
  );
  await page.screenshot({ path: ".tmp-container-e2e/japanese-font.png" });
  assert.ok(
    await page
      .locator("p")
      .evaluate(
        (element: HTMLElement) => element.getBoundingClientRect().height > 0,
      ),
  );
  const video = page.video();
  await page.close();
  assert.ok(
    video && existsSync(await video.path()),
    "FFmpeg video smoke failed",
  );
  writeFileSync(
    ".tmp-container-e2e/manifest.json",
    JSON.stringify({
      ...config,
      chromium: browser.version(),
      headlessRevision: headless.revision,
      ffmpegRevision: ffmpeg.revision,
      font,
    }),
  );
} finally {
  await browser.close();
}
