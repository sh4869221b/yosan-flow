import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  renderSummary,
  runCli,
  summarizeReport,
} from "../../scripts/e2e-summary";

const jobs = {
  jobs: [
    {
      name: "E2E tests",
      status: "completed",
      started_at: "2026-09-12T00:00:00Z",
      completed_at: "2026-09-12T00:01:00Z",
      steps: [
        {
          name: "Run tests",
          status: "completed",
          started_at: "2026-09-12T00:00:10Z",
          completed_at: "2026-09-12T00:00:40Z",
        },
      ],
    },
  ],
};
const emptyReport = {
  suites: [],
  stats: { duration: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
};
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("E2E timing summary", () => {
  it("ranks individual project entries across nested suites and sums retries before rounding", () => {
    const report = {
      stats: {
        duration: 12345.67,
        expected: 4,
        unexpected: 1,
        flaky: 1,
        skipped: 1,
      },
      suites: [
        {
          title: "budget.spec.ts",
          specs: [],
          suites: [
            {
              title: "settings | `edit`\n[link]",
              specs: Array.from({ length: 6 }, (_, index) => ({
                file: "budget.spec.ts",
                line: index + 10,
                title: `test ${index}`,
                tests: [
                  {
                    projectName: "chromium",
                    results: [{ duration: index * 1000 + 0.4 }],
                  },
                  ...(index === 0
                    ? [
                        {
                          projectName: "webkit",
                          results: [{ duration: 3000.4 }, { duration: 2000.4 }],
                        },
                      ]
                    : []),
                ],
              })),
            },
          ],
        },
      ],
    };

    const summary = summarizeReport(report);
    const markdown = renderSummary({
      report,
      jobs,
      jobName: "E2E tests",
      timing: { buildStartedAt: 1000, readyObservedAt: 3456 },
    });

    expect(summary.counts).toEqual({
      expected: 4,
      failed: 1,
      flaky: 1,
      skipped: 1,
    });
    expect(summary.total).toBe(7);
    expect(summary.attemptDuration).toBeCloseTo(20003.2);
    expect(
      summary.topTests.map(({ line, project }) => [line, project]),
    ).toEqual([
      [10, "webkit"],
      [15, "chromium"],
      [14, "chromium"],
      [13, "chromium"],
      [12, "chromium"],
    ]);
    expect(markdown).toContain(
      "| Test attempts total (including retries) | 20.003 s |",
    );
    expect(markdown).toContain(
      "| Playwright run (stats.duration) | 12.346 s |",
    );
    expect(markdown).toContain(
      "| Build start → Playwright HTTP-ready observation | 2.456 s |",
    );
    expect(markdown).toContain("settings &#124; \\`edit\\` \\[link\\]");
  });

  it("orders equal durations by title, location and project", () => {
    const report = {
      ...emptyReport,
      suites: [
        {
          title: "suite",
          specs: [
            {
              title: "B",
              file: "a.ts",
              line: 1,
              tests: [{ projectName: "a", results: [{ duration: 1 }] }],
            },
            {
              title: "A",
              file: "b.ts",
              line: 1,
              tests: [{ projectName: "a", results: [{ duration: 1 }] }],
            },
            {
              title: "A",
              file: "a.ts",
              line: 2,
              tests: [
                { projectName: "b", results: [{ duration: 1 }] },
                { projectName: "a", results: [{ duration: 1 }] },
              ],
            },
            {
              title: "A",
              file: "a.ts",
              line: 1,
              tests: [{ projectName: "a", results: [{ duration: 1 }] }],
            },
          ],
        },
      ],
    };
    expect(
      summarizeReport(report).topTests.map(({ title, file, line, project }) => [
        title,
        file,
        line,
        project,
      ]),
    ).toEqual([
      ["suite › A", "a.ts", 1, "a"],
      ["suite › A", "a.ts", 2, "a"],
      ["suite › A", "a.ts", 2, "b"],
      ["suite › A", "b.ts", 1, "a"],
      ["suite › B", "a.ts", 1, "a"],
    ]);
  });

  it("preserves job timing when the report is missing and startup is incomplete", async () => {
    const dir = await mkdtemp(join(tmpdir(), "e2e-summary-"));
    directories.push(dir);
    await writeFile(join(dir, "jobs.json"), JSON.stringify(jobs));
    await writeFile(
      join(dir, "timing.json"),
      JSON.stringify({ buildStartedAt: 1000 }),
    );

    const summary = await runCli([
      "--report",
      join(dir, "missing.json"),
      "--timing",
      join(dir, "timing.json"),
      "--jobs",
      join(dir, "jobs.json"),
      "--job-name",
      "E2E tests",
    ]);

    expect(summary).toContain("| Completed E2E job wall-clock | 60.000 s |");
    expect(summary).toContain("| Run tests | 30.000 s |");
    expect(summary).toContain(
      "| Build start → Playwright HTTP-ready observation | Unavailable |",
    );
    expect(summary).toContain("Unavailable: Playwright JSON report");
  });

  it("keeps zero-test reports at zero and absent jobs unavailable", () => {
    const summary = renderSummary({
      report: emptyReport,
      jobs: { jobs: [] },
      jobName: "E2E tests",
    });
    expect(summary).toContain("| Completed E2E job wall-clock | Unavailable |");
    expect(summary).toContain("| Playwright run (stats.duration) | 0.000 s |");
    expect(summary).toContain("| 0 | 0 | 0 | 0 | 0 |");
  });

  it("rejects malformed JSON at the CLI with an explicit error and nonzero exit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "e2e-summary-"));
    directories.push(dir);
    await writeFile(join(dir, "report.json"), "{");
    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/e2e-summary.ts"),
        "--report",
        join(dir, "report.json"),
        "--timing",
        join(dir, "missing.json"),
        "--jobs",
        join(dir, "jobs.json"),
        "--job-name",
        "E2E tests",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E summary error: Malformed JSON");
    expect(result.stdout).toContain("## E2E summary error");
  });

  it("rejects invalid consumed data rather than fabricating measurements", () => {
    expect(() =>
      summarizeReport({
        ...emptyReport,
        stats: { ...emptyReport.stats, duration: "12" },
      }),
    ).toThrow("finite nonnegative number");
    expect(() =>
      renderSummary({
        jobs,
        jobName: "E2E tests",
        timing: { buildStartedAt: 2000, readyObservedAt: 1000 },
      }),
    ).toThrow("HTTP readiness precedes build start");
  });
});
