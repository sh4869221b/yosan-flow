import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a JSON array");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Expected a finite nonnegative number");
  }
  return value;
}

function escapeCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replace(/[\\`*_\[\]]/g, "\\$&")
    .replace(/[\r\n]+/g, " ");
}

type TestTiming = {
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly project: string;
  readonly duration: number;
};

export function summarizeReport(value: unknown) {
  const report = object(value);
  const stats = object(report.stats);
  const counts = {
    expected: number(stats.expected),
    failed: number(stats.unexpected),
    flaky: number(stats.flaky),
    skipped: number(stats.skipped),
  };
  if (Object.values(counts).some((count) => !Number.isInteger(count))) {
    throw new Error("Expected integer test counts");
  }
  const tests: TestTiming[] = [];
  function visit(value: unknown, parents: readonly string[]) {
    const suite = object(value);
    const titles = [...parents, string(suite.title)];
    for (const entry of array(suite.specs)) {
      const spec = object(entry);
      const file = string(spec.file);
      const line = number(spec.line);
      const title = [...titles, string(spec.title)].join(" › ");
      for (const entry of array(spec.tests)) {
        const test = object(entry);
        tests.push({
          file,
          line,
          title,
          project: string(test.projectName),
          duration: array(test.results).reduce<number>(
            (sum, result) => sum + number(object(result).duration),
            0,
          ),
        });
      }
    }
    for (const child of array(suite.suites === undefined ? [] : suite.suites))
      visit(child, titles);
  }
  for (const suite of array(report.suites)) visit(suite, []);
  const attemptDuration = tests.reduce((sum, test) => sum + test.duration, 0);
  tests.sort(
    (a, b) =>
      b.duration - a.duration ||
      a.title.localeCompare(b.title, "en") ||
      a.file.localeCompare(b.file, "en") ||
      a.line - b.line ||
      a.project.localeCompare(b.project, "en"),
  );
  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    duration: number(stats.duration),
    attemptDuration,
    topTests: tests.slice(0, 5),
  };
}

function seconds(duration: number | undefined): string {
  return duration === undefined
    ? "Unavailable"
    : `${(duration / 1000).toFixed(3)} s`;
}

function interval(value: Record<string, unknown>): number | undefined {
  if (value.started_at == null || value.completed_at == null) return undefined;
  const start = Date.parse(string(value.started_at));
  const end = Date.parse(string(value.completed_at));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Invalid job or step timestamps");
  }
  return value.status === "completed" ? end - start : undefined;
}

export function renderSummary(input: {
  readonly report?: unknown;
  readonly timing?: unknown;
  readonly jobs: unknown;
  readonly jobName: string;
}): string {
  const matches = array(object(input.jobs).jobs)
    .map(object)
    .filter((job) => string(job.name) === input.jobName);
  if (matches.length > 1) throw new Error("Ambiguous E2E job name");
  const job = matches[0];
  let startup: number | undefined;
  if (input.timing !== undefined) {
    const timing = object(input.timing);
    const start = number(timing.buildStartedAt);
    if (timing.readyObservedAt !== undefined) {
      startup = number(timing.readyObservedAt) - start;
      if (startup < 0) throw new Error("HTTP readiness precedes build start");
    }
  }
  const report =
    input.report === undefined ? undefined : summarizeReport(input.report);
  const lines = [
    "## E2E timing",
    "",
    `Job: ${escapeCell(input.jobName)}`,
    "",
    "| Metric | Duration |",
    "| --- | ---: |",
    `| Completed E2E job wall-clock | ${seconds(job && interval(job))} |`,
    `| E2E startup sequence → Playwright HTTP-ready observation | ${seconds(startup)} |`,
    `| Playwright run (stats.duration) | ${seconds(report?.duration)} |`,
    `| Test attempts total (including retries) | ${seconds(report?.attemptDuration)} |`,
    "",
    "Job wall-clock excludes queue time and this summary job. Step intervals do not necessarily sum to job wall-clock. Startup includes migrations, server startup, HTTP detection and hook handoff, plus build when not using prebuilt output.",
    "",
    "### E2E job steps",
    "",
    "| Step | Duration |",
    "| --- | ---: |",
  ];
  if (job?.steps == null) lines.push("| Unavailable | Unavailable |");
  else {
    for (const entry of array(job.steps)) {
      const step = object(entry);
      lines.push(
        `| ${escapeCell(string(step.name))} | ${seconds(interval(step))} |`,
      );
    }
  }
  lines.push("", "### Test outcomes", "");
  if (!report)
    lines.push("Unavailable: Playwright JSON report was not produced.");
  else {
    const { counts } = report;
    lines.push(
      "| Total | Expected | Failed (unexpected) | Flaky | Skipped |",
      "| ---: | ---: | ---: | ---: | ---: |",
      `| ${report.total} | ${counts.expected} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} |`,
      "",
      "### Slowest individual tests (all attempts)",
      "",
      "| Test | Location | Project | Duration |",
      "| --- | --- | --- | ---: |",
      ...report.topTests.map(
        (test) =>
          `| ${escapeCell(test.title)} | ${escapeCell(test.file)}:${test.line} | ${escapeCell(test.project)} | ${seconds(test.duration)} |`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function readJson(path: string, optional = false): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (
      optional &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Malformed JSON in ${path}`, { cause: error });
  }
}

export async function runCli(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      report: { type: "string" },
      timing: { type: "string" },
      jobs: { type: "string" },
      "job-name": { type: "string" },
    },
  });
  if (!values.report || !values.timing || !values.jobs || !values["job-name"]) {
    throw new Error(
      "Required: --report <path> --timing <path> --jobs <path> --job-name <name>",
    );
  }
  return renderSummary({
    report: await readJson(values.report, true),
    timing: await readJson(values.timing, true),
    jobs: await readJson(values.jobs),
    jobName: values["job-name"],
  });
}

if (import.meta.main) {
  try {
    process.stdout.write(await runCli(process.argv.slice(2)));
  } catch (error) {
    const message = `E2E summary error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    process.stdout.write(`## E2E summary error\n\n${escapeCell(message)}\n`);
    process.exitCode = 1;
  }
}
