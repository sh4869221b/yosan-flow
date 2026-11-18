import { expect, it, vi } from "vitest";
import { createDashboardPageController } from "#lib/dashboard/page-controller.svelte.ts";
import { createDayEntrySyncState } from "#lib/dashboard/day-entry-sync-state.svelte.ts";
import { createPeriodControllerState } from "#lib/dashboard/period-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { periodSummaryUrl, periodsUrl } from "#lib/dashboard/api-urls.ts";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

const executions = captureClientEffects();
const period = {
  id: "period-1",
  startDate: "2026-07-12",
  endDate: "2026-07-13",
  budgetYen: 10_000,
  status: "active" as const,
  predecessorPeriodId: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};
const data = () => ({
  today: "2026-07-12",
  periods: [period],
  selectedPeriodId: period.id,
  summary: createSummary(0),
});

it("refreshes the selected summary without losing settings or day-entry drafts", async () => {
  const freshSummary = createSummary(2_000);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        jsonResponse(
          url === periodsUrl()
            ? { periods: [period] }
            : url.endsWith("/history")
              ? { periodId: period.id, date: "2026-07-12", histories: [] }
              : freshSummary,
        ),
      ),
    ),
  );
  const controller = createDashboardPageController(() => ({
    ...data(),
    dayEntryEpoch: "d".repeat(32),
  }));
  controller.budget.draft = "15000";
  controller.range.edit({ startDate: "2026-07-12", endDate: "2026-07-14" });
  controller.openDayEntry({ date: "2026-07-12" });
  await settled(executions[0]);
  controller.modalInputYen = "777";
  controller.modalMemo = "draft";
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  await settled(executions[1]);
  await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

  expect(controller.summary).toEqual(freshSummary);
  expect(controller.selectedPeriodId).toBe(period.id);
  expect(controller.budget.draft).toBe("15000");
  expect(controller.range.draft.endDate).toBe("2026-07-14");
  expect(controller.modalOpen).toBe(true);
  expect(controller.selectedDate).toBe("2026-07-12");
  expect(controller.selectedRow?.usedYen).toBe(2_000);
  expect(controller.modalInputYen).toBe("777");
  expect(controller.modalMemo).toBe("draft");
  expect(controller.modalPreviewAfterYen).toBe(2_777);
  expect(complete).toHaveBeenCalledOnce();
});

it("discards a resume response captured before a newer spending publication", async () => {
  const response = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === periodsUrl()) {
        return Promise.resolve(jsonResponse({ periods: [period] }));
      }
      started.resolve();
      return response.promise;
    }),
  );
  const revision = createPeriodSummaryRevision();
  const controller = createPeriodControllerState(data(), revision);
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  await settled(started.promise);
  const savedSummary = createSummary(2_000);
  revision.publish(savedSummary, controller.setSummary);
  response.resolve(jsonResponse(createSummary(0)));
  await settled(executions[0]);

  expect(controller.summary).toEqual(savedSummary);
  expect(controller.summaryLoading).toBe(false);
  expect(complete).toHaveBeenCalledOnce();
});

it("clears a 204 warning only after adopting a post-save summary on resume", async () => {
  const date = period.startDate;
  const summaryUrl = periodSummaryUrl(period.id);
  const stale = Promise.withResolvers<Response>();
  const staleStarted = Promise.withResolvers<void>();
  const freshSummary = createSummary(300);
  const readSummary = vi
    .fn<() => Promise<Response>>()
    .mockImplementationOnce(() => {
      staleStarted.resolve();
      return stale.promise;
    })
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(jsonResponse(freshSummary));
  const post = vi.fn(() => new Response(null, { status: 204 }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return post();
      if (url === periodsUrl()) return jsonResponse({ periods: [period] });
      if (url === summaryUrl) return readSummary();
      if (url.endsWith("/history")) {
        return jsonResponse({ periodId: period.id, date, histories: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  const controller = createDashboardPageController(() => ({
    ...data(),
    dayEntryEpoch: "d".repeat(32),
  }));
  controller.openDayEntry({ date });
  await settled(executions[0]);
  const oldResumeFinished = Promise.withResolvers<void>();
  controller.refreshOnResume(oldResumeFinished.resolve);
  await settled(staleStarted.promise);

  controller.submitDayEntry({ date, inputYen: 300, memo: "" });
  await settled(executions[2]);
  expect(controller.daySummarySyncPending).toBe(true);
  expect(controller.summary).toEqual(createSummary(0));

  stale.resolve(jsonResponse(createSummary(0)));
  await settled(oldResumeFinished.promise);
  expect(controller.daySummarySyncPending).toBe(true);

  const resumeFinished = Promise.withResolvers<void>();
  controller.refreshOnResume(resumeFinished.resolve);
  await settled(resumeFinished.promise);
  expect(controller.summary).toEqual(freshSummary);
  expect(controller.daySummarySyncPending).toBe(false);
  expect(post).toHaveBeenCalledOnce();
  expect(readSummary).toHaveBeenCalledTimes(3);
});

it("keeps a newer save pending when the summary read began before it", () => {
  const sync = createDayEntrySyncState(() => period.id);
  const date = period.startDate;
  const beforeSave = sync.captureSummarySync(period.id);
  sync.markPending(period.id, date);
  beforeSave?.();
  expect(sync.pending).toBe(true);

  const afterFirstSave = sync.captureSummarySync(period.id);
  sync.markPending(period.id, date);
  afterFirstSave?.();
  expect(sync.pending).toBe(true);

  sync.markPending("period-2", date);
  sync.captureSummarySync("period-2")?.();
  expect(sync.pending).toBe(true);

  sync.captureSummarySync(period.id)?.();
  expect(sync.pending).toBe(false);
});

it("keeps the displayed data and releases the resume request after a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const controller = createPeriodControllerState(data());
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  await settled(executions[0]);

  expect(controller.summary).toEqual(createSummary(0));
  expect(controller.summaryLoading).toBe(false);
  expect(controller.summaryError).toBe("再取得に失敗しました。");
  expect(complete).toHaveBeenCalledOnce();
});
