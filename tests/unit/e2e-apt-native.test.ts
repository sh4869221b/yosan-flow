import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const helper = "/usr/lib/apt/apt-helper";
const bytes = Buffer.from(Array.from({ length: 65_536 }, (_, i) => i % 256));
const corrupted = Buffer.from(bytes);
corrupted[0] ^= 1;
const hash = createHash("sha256").update(bytes).digest("hex");
const directories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  try {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
    }
  } finally {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  }
});

async function fixture(initial?: Buffer, response = bytes) {
  const directory = mkdtempSync(join(tmpdir(), "e2e-apt-native-"));
  directories.push(directory);
  const target = join(directory, "fixture.deb");
  if (initial) writeFileSync(target, initial);
  let requests = 0;
  const server = createServer((_request, reply) => {
    requests++;
    reply.writeHead(200, { "Content-Length": response.length });
    reply.end(response);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local APT fixture address");
  const args = [
    "-o",
    "Acquire::Retries=0",
    "-o",
    "Acquire::http::Timeout=5",
    "-o",
    "Acquire::http::Proxy::127.0.0.1=DIRECT",
    "download-file",
    `http://127.0.0.1:${address.port}/fixture.deb`,
    target,
    `SHA256:${hash}`,
    // Both fields come from package indexes in apt-get. The size is essential
    // to exercise the shared HTTP method's complete-partial-file fast path.
    `Checksum-FileSize:${bytes.length}`,
  ];
  const result = await new Promise<{
    status: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    // Keep Node's event loop available to serve the local HTTP fixture.
    execFile(
      helper,
      args,
      {
        encoding: "utf8",
        timeout: 5_000,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        env: { ...process.env, LC_ALL: "C" },
      },
      (error, stdout, stderr) => {
        if (error && (error.killed || typeof error.code !== "number")) {
          reject(error);
          return;
        }
        resolve({
          status: typeof error?.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
  return { target, requests, ...result };
}

// This validates native acquisition on the host's APT version, without sudo,
// package installation, external traffic, or configuration/trust changes.
// Repository signature/update behavior remains covered by normal CI installation.
describe.skipIf(process.platform !== "linux" || !existsSync(helper))(
  "APT native partial archive verification",
  () => {
    beforeAll(() => {
      console.info(
        execFileSync(helper, ["--version"], { encoding: "utf8" }).trim(),
      );
    });

    it("downloads a missing archive", async () => {
      const result = await fixture();
      expect(result.status, result.stderr).toBe(0);
      expect(result.requests).toBe(1);
      expect(readFileSync(result.target)).toEqual(bytes);
    });

    it("hash-checks and reuses a complete archive without an HTTP request", async () => {
      const result = await fixture(bytes);
      expect(result.status, result.stderr).toBe(0);
      expect(result.requests).toBe(0);
      expect(readFileSync(result.target)).toEqual(bytes);
    });

    it("redownloads a same-size corrupted archive", async () => {
      expect(corrupted.length).toBe(bytes.length);
      const result = await fixture(corrupted);
      expect(result.status, result.stderr).toBe(0);
      expect(result.requests).toBe(1);
      expect(readFileSync(result.target)).toEqual(bytes);
    });

    it("rejects corruption in both the cached archive and download", async () => {
      const result = await fixture(corrupted, corrupted);
      expect(result.status).toBe(100);
      expect(result.requests).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Hash Sum mismatch",
      );
      expect(existsSync(result.target)).toBe(false);
    });
  },
);
