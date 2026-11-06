import { describe, expect, it } from "vitest";
import { verifyPartition } from "../../scripts/e2e-shard-trial.ts";

function report(ids: string[], current = 0, total = 0) {
  return {
    errors: [] as unknown[],
    config: {
      workers: 1,
      fullyParallel: false,
      shard: current ? { current, total } : null,
      projects: [{ repeatEach: 1, retries: 0 }],
    },
    stats: {
      expected: ids.length,
      unexpected: 0,
      skipped: 0,
      flaky: 0,
      duration: 100,
    },
    suites: [
      {
        title: "example.spec.ts",
        specs: ids.map((id) => ({
          id,
          file: "example.spec.ts",
          title: id,
          line: 1,
          tests: [
            {
              expectedStatus: "passed",
              projectName: "",
              status: "expected",
              results: current
                ? [
                    {
                      status: "passed",
                      retry: 0,
                      duration: 10,
                      errors: [] as unknown[],
                    },
                  ]
                : [],
            },
          ],
        })),
      },
    ],
  };
}

describe("E2E shard experiment acceptance", () => {
  it.each([2, 3, 4])(
    "accepts all tests exactly once across %s isolated shards",
    (total) => {
      const ids = Array.from({ length: total * 2 }, (_, i) => `test-${i}`);
      const shards = Array.from({ length: total }, (_, i) =>
        report(ids.slice(i * 2, i * 2 + 2), i + 1, total),
      );
      expect(verifyPartition(report(ids), shards)).toBe(ids.length);
    },
  );

  it("rejects a missing shard and a missing test", () => {
    const full = report(["a", "b", "c"]);
    expect(() => verifyPartition(full, [report(["a"], 1, 2)])).toThrow();
    expect(() =>
      verifyPartition(full, [report(["a"], 1, 2), report(["b"], 2, 2)]),
    ).toThrow(/inventory/);
  });

  it("rejects duplicates even when raw counts match", () => {
    expect(() =>
      verifyPartition(report(["a", "b"]), [
        report(["a"], 1, 2),
        report(["a"], 2, 2),
      ]),
    ).toThrow(/Duplicate/);
  });

  it("rejects unknown tests, repeated inventory entries and wrong shard metadata", () => {
    expect(() =>
      verifyPartition(report(["a", "b"]), [
        report(["a"], 1, 2),
        report(["c"], 2, 2),
      ]),
    ).toThrow(/inventory/);
    expect(() =>
      verifyPartition(report(["a", "a"]), [
        report(["a"], 1, 2),
        report(["b"], 2, 2),
      ]),
    ).toThrow(/Duplicate/);
    expect(() =>
      verifyPartition(report(["a", "b"]), [
        report(["a"], 2, 2),
        report(["b"], 1, 2),
      ]),
    ).toThrow();
  });

  it.each(["failed", "skipped", "timedOut", "interrupted"])(
    "rejects %s attempts",
    (status) => {
      const shards = [report(["a"], 1, 2), report(["b"], 2, 2)];
      shards[0].suites[0].specs[0].tests[0].results[0].status = status;
      expect(() => verifyPartition(report(["a", "b"]), shards)).toThrow();
    },
  );

  it.each(["retry", "flaky", "workers", "parallel", "errors", "counts"])(
    "rejects invalid %s evidence",
    (kind) => {
      const shards = [report(["a"], 1, 2), report(["b"], 2, 2)];
      const first = shards[0];
      const test = first.suites[0].specs[0].tests[0];
      if (kind === "retry") test.results.push({ ...test.results[0], retry: 1 });
      if (kind === "flaky") test.status = "flaky";
      if (kind === "workers") first.config.workers = 2;
      if (kind === "parallel") first.config.fullyParallel = true;
      if (kind === "errors") first.errors.push({ message: "setup failed" });
      if (kind === "counts") first.stats.expected++;
      expect(() => verifyPartition(report(["a", "b"]), shards)).toThrow();
    },
  );
});
