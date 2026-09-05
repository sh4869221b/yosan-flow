import { Deferred, Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "$lib/dashboard/day-entry-controller-state.svelte";
import { createDashboardPageController } from "$lib/dashboard/page-controller.svelte";
import type {
  PeriodOption,
  PeriodSummary,
} from "$lib/dashboard/controller-types";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";

afterEach(() => vi.unstubAllGlobals());

const date = "2026-07-12";

function forPeriod(summary: PeriodSummary, periodId: string): PeriodSummary {
  return { ...summary, periodId };
}

function createController(options?: {
  readonly loadHistoryEffect?: () => Effect.Effect<void, never>;
}) {
  let selectedPeriodId = "period-1";
  let summary = forPeriod(createSummary(0), selectedPeriodId);
  const controller = createDayEntryControllerState({
    getSelectedPeriodId: () => selectedPeriodId,
    getSummary: () => summary,
    historyController: {
      getMutationSequence: () => 0,
      loadHistory: vi.fn(),
      loadHistoryEffect: options?.loadHistoryEffect ?? (() => Effect.void),
      resetHistories: vi.fn(),
    },
    setSummary: (nextSummary) => {
      summary = nextSummary;
    },
  });
  return {
    controller,
    get summary() {
      return summary;
    },
    setSelectedPeriodId(value: string): void {
      selectedPeriodId = value;
    },
    setSummary(value: PeriodSummary): void {
      summary = value;
    },
  };
}

async function saveAccepted(
  controller: ReturnType<typeof createController>["controller"],
): Promise<void> {
  controller.openDayEntry({ date });
  controller.submitDayEntry({ date, inputYen: 1_200, memo: "昼食" });
  await vi.waitFor(() => expect(controller.modalOpen).toBe(false));
}

describe("day-entry accepted save success", () => {
  it("publishes accepted success and preserves it after success close", async () => {
    // Given
    const historyFinished = Effect.runSync(Deferred.make<void>());
    const saveResponse = Promise.withResolvers<Response>();
    const loadHistoryEffect = vi.fn(() => Deferred.await(historyFinished));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => saveResponse.promise),
    );
    const { controller } = createController({ loadHistoryEffect });
    controller.openDayEntry({ date });
    controller.modalInputYen = "1200";
    controller.modalMemo = "昼食";

    // When
    controller.submitDayEntry({ date, inputYen: 1_200, memo: "昼食" });
    saveResponse.resolve(
      jsonResponse(forPeriod(createSummary(1_200), "period-1")),
    );

    // Then
    await vi.waitFor(() => expect(loadHistoryEffect).toHaveBeenCalledOnce());
    expect(controller.daySaveSuccess).toEqual({ periodId: "period-1", date });
    expect(controller.modalOpen).toBe(false);
    expect(controller.dayEntryCloseReason).toBe("success");
    expect(controller.daySaveSuccess).toEqual({ periodId: "period-1", date });
    Effect.runSync(Deferred.succeed(historyFinished, undefined));
  });

  it.each([
    {
      name: "open",
      clear: (controller: ReturnType<typeof createController>["controller"]) =>
        controller.openDayEntry({ date }),
      closeReason: null,
    },
    {
      name: "yen edit",
      clear: (controller: ReturnType<typeof createController>["controller"]) =>
        (controller.modalInputYen = "1300"),
      closeReason: "success",
    },
    {
      name: "memo edit",
      clear: (controller: ReturnType<typeof createController>["controller"]) =>
        (controller.modalMemo = "夕食"),
      closeReason: "success",
    },
    {
      name: "cancel",
      clear: (controller: ReturnType<typeof createController>["controller"]) =>
        controller.closeDayEntry(),
      closeReason: "cancel",
    },
    {
      name: "selection invalidation",
      clear: (controller: ReturnType<typeof createController>["controller"]) =>
        controller.invalidateDaySelection(),
      closeReason: "success",
    },
  ] as const)(
    "clears accepted success on $name",
    async ({ clear, closeReason }) => {
      // Given
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            jsonResponse(forPeriod(createSummary(1_200), "period-1")),
          ),
        ),
      );
      const { controller } = createController();
      await saveAccepted(controller);

      // When
      clear(controller);

      // Then
      expect(controller.daySaveSuccess).toBeNull();
      expect(controller.dayEntryCloseReason).toBe(closeReason);
    },
  );

  it("rejects a delayed success after cancel and reopen", async () => {
    // Given
    const saveResponse = Promise.withResolvers<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => saveResponse.promise),
    );
    const harness = createController();
    const { controller } = harness;
    controller.openDayEntry({ date });
    controller.submitDayEntry({ date, inputYen: 1_200, memo: "old" });
    await vi.waitFor(() => expect(controller.modalSaving).toBe(true));

    // When
    controller.closeDayEntry();
    controller.openDayEntry({ date: "2026-07-13" });
    controller.modalInputYen = "900";
    saveResponse.resolve(
      jsonResponse(forPeriod(createSummary(1_200), "period-1")),
    );

    // Then
    await vi.waitFor(() => expect(harness.summary.spentToDateYen).toBe(1_200));
    expect(controller.daySaveSuccess).toBeNull();
    expect(controller.modalOpen).toBe(true);
    expect(controller.selectedDate).toBe("2026-07-13");
    expect(controller.modalInputYen).toBe("900");
  });

  it("rejects a delayed period A success after selection A to B to A", async () => {
    // Given
    const periodA: PeriodOption = {
      id: "period-a",
      startDate: date,
      endDate: date,
      budgetYen: 10_000,
      status: "active",
      predecessorPeriodId: null,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    const periodB = {
      ...periodA,
      id: "period-b",
      status: "closed",
    } satisfies PeriodOption;
    const periodASummary = forPeriod(createSummary(0), periodA.id);
    const periodBSummary = forPeriod(createSummary(0), periodB.id);
    const saveResponse = Promise.withResolvers<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith(`/days/${date}/history`)) {
        return Promise.resolve(jsonResponse({ histories: [] }));
      }
      if (method === "POST") return saveResponse.promise;
      if (url === `/api/periods/${periodB.id}`) {
        return Promise.resolve(jsonResponse(periodBSummary));
      }
      if (url === `/api/periods/${periodA.id}`) {
        return Promise.resolve(jsonResponse(periodASummary));
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = createDashboardPageController(() => ({
      today: date,
      periods: [periodA, periodB],
      selectedPeriodId: periodA.id,
      summary: periodASummary,
    }));
    controller.openDayEntry({ date });
    controller.submitDayEntry({ date, inputYen: 1_200, memo: "old A" });
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/periods/${periodA.id}/days/${date}/add`,
        expect.objectContaining({ method: "POST" }),
      ),
    );

    // When
    controller.handleSelectPeriod({ periodId: periodB.id });
    await vi.waitFor(() =>
      expect(controller.selectedPeriodId).toBe(periodB.id),
    );
    expect(controller.dayEntryCloseReason).toBe("period-change");
    controller.handleSelectPeriod({ periodId: periodA.id });
    saveResponse.resolve(
      jsonResponse(forPeriod(createSummary(1_200), periodA.id)),
    );

    // Then
    await vi.waitFor(() =>
      expect(controller.selectedPeriodId).toBe(periodA.id),
    );
    expect(controller.daySaveSuccess).toBeNull();
    expect(controller.modalOpen).toBe(false);
  });

  it("keeps the failed draft open without publishing success", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse({ error: { message: "failed" } }, 500)),
      ),
    );
    const { controller } = createController();
    controller.openDayEntry({ date });
    controller.modalInputYen = "1200";
    controller.modalMemo = "昼食";

    // When
    controller.submitDayEntry({ date, inputYen: 1_200, memo: "昼食" });

    // Then
    await vi.waitFor(() => expect(controller.modalError).toBe("failed"));
    expect(controller.daySaveSuccess).toBeNull();
    expect(controller.modalOpen).toBe(true);
    expect(controller.modalInputYen).toBe("1200");
    expect(controller.modalMemo).toBe("昼食");
  });
});
