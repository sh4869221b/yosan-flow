import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "#lib/dashboard/day-entry-controller-state.svelte.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";

const executions = captureClientEffects();
const periodId = "period-1";
const date = "2026-07-12";

function setup() {
  const post = vi.fn<() => Promise<Response>>();
  const read = vi.fn(async () => jsonResponse({}, 503));
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "POST" ? post() : read(),
    ),
  );
  let summary = createSummary(0);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => periodId,
    getSummary: () => summary,
    historyController: {
      getMutationSequence: () => 0,
      loadHistory: vi.fn(),
      loadHistoryEffect: () => Effect.void,
      resetHistories: vi.fn(),
    },
    setSummary: (next) => {
      summary = next;
    },
  });
  return {
    controller,
    post,
    read,
    get summary() {
      return summary;
    },
    submit(inputYen: number) {
      controller.openDayEntry({ date });
      controller.submitDayEntry({ date, inputYen, memo: "" });
      return executions.at(-1)!;
    },
  };
}

it.each([false, true])(
  "keeps a concurrent 204 pending after an older POST response (previous warning: %s)",
  async (previousWarning) => {
    const harness = setup();
    if (previousWarning) {
      harness.post.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await settled(harness.submit(100));
      expect(harness.controller.summarySyncPending).toBe(true);
    }

    const stale = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    harness.post
      .mockImplementationOnce(() => {
        started.resolve();
        return stale.promise;
      })
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const oldSubmission = harness.submit(200);
    await settled(started.promise);
    await settled(harness.submit(300));
    expect(harness.controller.summarySyncPending).toBe(true);

    const staleSummary = createSummary(previousWarning ? 300 : 200);
    stale.resolve(jsonResponse(staleSummary));
    await settled(oldSubmission);
    expect(harness.summary).toEqual(staleSummary);
    expect(harness.controller.summarySyncPending).toBe(true);

    const latestSummary = createSummary(previousWarning ? 700 : 600);
    harness.post.mockResolvedValueOnce(jsonResponse(latestSummary));
    await settled(harness.submit(100));
    expect(harness.summary).toEqual(latestSummary);
    expect(harness.controller.summarySyncPending).toBe(false);
    expect(harness.read).toHaveBeenCalled();
  },
);

it("keeps the warning when a POST contributes a recording but its older day totals are discarded", async () => {
  const harness = setup();
  const older = Promise.withResolvers<Response>();
  const olderStarted = Promise.withResolvers<void>();
  harness.post
    .mockImplementationOnce(() => {
      olderStarted.resolve();
      return older.promise;
    })
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const oldSubmission = harness.submit(400);
  await settled(olderStarted.promise);
  await settled(harness.submit(100));
  expect(harness.controller.summarySyncPending).toBe(true);

  const candidate = Promise.withResolvers<Response>();
  const candidateStarted = Promise.withResolvers<void>();
  harness.post.mockImplementationOnce(() => {
    candidateStarted.resolve();
    return candidate.promise;
  });
  const submission = harness.submit(0);
  await settled(candidateStarted.promise);
  older.resolve(jsonResponse(createSummary(500)));
  await settled(oldSubmission);

  const lowerSummary = createSummary(100);
  lowerSummary.dailyRows[1].isRecorded = true;
  candidate.resolve(jsonResponse(lowerSummary));
  await settled(submission);
  expect(harness.summary.plannedTotalYen).toBe(500);
  expect(harness.summary.dailyRows[1].isRecorded).toBe(true);
  expect(harness.controller.summarySyncPending).toBe(true);
});
