import { readFile, writeFile } from "node:fs/promises";

const timingPath = ".tmp-e2e-timing.json";

export default async function recordHttpReady(): Promise<void> {
  const timing = JSON.parse(await readFile(timingPath, "utf8"));
  await writeFile(
    timingPath,
    JSON.stringify({ ...timing, readyObservedAt: Date.now() }),
  );
}

if (import.meta.main && process.argv[2] === "start") {
  await writeFile(timingPath, JSON.stringify({ buildStartedAt: Date.now() }));
}
