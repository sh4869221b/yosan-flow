import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Font = {
  package: string;
  version: string;
  filename: string;
  size: number;
  sha256: string;
};

export async function prepareFont(font: Font, directory: string) {
  assert.match(font.sha256, /^[a-f0-9]{64}$/);
  assert.match(
    font.filename,
    /^pool\/main\/f\/fonts-noto-cjk\/fonts-noto-cjk_[A-Za-z0-9.+~-]+_all\.deb$/,
  );
  assert.ok(Number.isSafeInteger(font.size) && font.size > 0);
  const path = join(directory, `${font.sha256}.deb`);
  function verify(bytes: Uint8Array) {
    assert.equal(bytes.byteLength, font.size, "Font package size mismatch");
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      font.sha256,
      "Font package integrity mismatch",
    );
  }
  let cached: Buffer | undefined;
  try {
    cached = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (cached) {
    // A restored cache is never an authority for package contents.
    verify(cached);
    console.log("Verified cached Japanese font package");
    return path;
  }
  const errors: unknown[] = [];
  for (const origin of [
    "https://archive.ubuntu.com/ubuntu/",
    "https://azure.archive.ubuntu.com/ubuntu/",
  ]) {
    try {
      const response = await fetch(new URL(font.filename, origin), {
        signal: AbortSignal.timeout(60_000),
      });
      assert.ok(response.ok, `Font download failed: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      verify(bytes);
      await mkdir(directory, { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, path);
      console.log(`Verified Japanese font package from ${origin}`);
      return path;
    } catch (error) {
      errors.push(error);
      console.error(`Font download from ${origin} failed; trying next source`);
    }
  }
  throw new AggregateError(
    errors,
    "No verified Japanese font package available",
  );
}

if (import.meta.main) {
  const font: Font = JSON.parse(
    await readFile("tooling/ci/container/font.json", "utf8"),
  );
  await prepareFont(font, ".tmp-container-fonts");
}
