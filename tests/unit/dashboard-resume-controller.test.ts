import { expect, it, vi } from "vitest";
import { createDashboardPageController } from "#lib/dashboard/page-controller.svelte.ts";
import { createPeriodControllerState } from "#lib/dashboard/period-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
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
          url.endsWith("/history")
            ? { periodId: period.id, date: "2026-07-12", histories: [] }
            : freshSummary,
        ),
      ),
    ),
  );
  const controller = createDashboardPageController(data);
  controller.budget.draft = "15000";
  controller.range.edit({ startDate: "2026-07-12", endDate: "2026-07-14" });
  controller.openDayEntry({ date: "2026-07-12" });
  await settled(executions[0]);
  controller.modalInputYen = "777";
  controller.modalMemo = "draft";
  const complete = vi.fn();
  controller.refreshOnResume(complete);
  await settled(executions[1]);

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
    vi.fn(() => {
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
