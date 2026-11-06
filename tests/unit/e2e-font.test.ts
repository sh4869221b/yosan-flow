import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { prepareFont } from "../../scripts/e2e-font.ts";

const bytes = Buffer.from("verified font fixture");
const font = {
  package: "fonts-noto-cjk",
  version: "1:20230817+repack1-3",
  filename:
    "pool/main/f/fonts-noto-cjk/fonts-noto-cjk_20230817+repack1-3_all.deb",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "e2e-font-"));
  directories.push(directory);
  return { directory, path: join(directory, `${font.sha256}.deb`) };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

it("downloads a pinned package once and revalidates the cache without network", async () => {
  const f = await fixture();
  const fetch = vi.fn().mockResolvedValue(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  expect(await prepareFont(font, f.directory)).toBe(f.path);
  expect(await readFile(f.path)).toEqual(bytes);
  expect(String(fetch.mock.calls[0][0])).toBe(
    `https://archive.ubuntu.com/ubuntu/${font.filename}`,
  );
  fetch.mockRejectedValue(new Error("offline"));
  expect(await prepareFont(font, f.directory)).toBe(f.path);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([Buffer.from("corrupt"), Buffer.alloc(bytes.length)])(
  "rejects corrupt restored content before network or installation: %j",
  async (corrupt) => {
    const f = await fixture();
    await writeFile(f.path, corrupt);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(prepareFont(font, f.directory)).rejects.toThrow(/mismatch/);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("uses the second official mirror after an HTTP failure", async () => {
  const f = await fixture();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  await prepareFont(font, f.directory);
  expect(String(fetch.mock.calls[1][0])).toBe(
    `https://azure.archive.ubuntu.com/ubuntu/${font.filename}`,
  );
  expect(await readFile(f.path)).toEqual(bytes);
});

it("never caches an unverified download even if both mirrors respond", async () => {
  const f = await fixture();
  const fetch = vi
    .fn()
    .mockImplementation(async () => new Response(Buffer.alloc(bytes.length)));
  vi.stubGlobal("fetch", fetch);
  await expect(prepareFont(font, f.directory)).rejects.toThrow(/No verified/);
  await expect(readFile(f.path)).rejects.toMatchObject({ code: "ENOENT" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("passes a finite abort signal covering download of the response body", async () => {
  const f = await fixture();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetch = vi.fn().mockImplementation(async (_url, options) => {
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return new Response(bytes);
  });
  vi.stubGlobal("fetch", fetch);
  try {
    await prepareFont(font, f.directory);
    expect(timeout).toHaveBeenCalledWith(60_000);
  } finally {
    timeout.mockRestore();
  }
});
