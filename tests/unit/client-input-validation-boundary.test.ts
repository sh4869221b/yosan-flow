import { Effect } from "effect";
import { CalendarDate, parseDate } from "@internationalized/date";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDayEntryControllerState } from "#lib/dashboard/day-entry-controller-state.svelte.ts";
import { createPeriodCreateState } from "#lib/dashboard/period-create-state.svelte.ts";
import { createPeriodControllerState } from "#lib/dashboard/period-controller-state.svelte.ts";
import { createPeriodSummaryRevision } from "#lib/dashboard/period-summary-revision.ts";
import { createPeriodSettingsState } from "#lib/dashboard/period-settings-state.svelte.ts";
import * as yenInput from "#lib/dashboard/yen-input.ts";
import {
  createSummary,
  jsonResponse,
} from "./day-entry-controller-test-fixtures";
import {
  captureClientEffects,
  settled,
} from "./period-controller-effect-fixture";

vi.mock("@internationalized/date", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@internationalized/date")>();
  return { ...actual, parseDate: vi.fn(actual.parseDate) };
});

const executions = captureClientEffects();

afterEach(() => vi.restoreAllMocks());

describe("client yen input boundary", () => {
  it("reuses the parsed day draft for previews, memo changes and reopening", () => {
    const parse = vi.spyOn(yenInput, "parseNonNegativeIntegerYenInput");
    const summary = createSummary(200);
    const controller = createDayEntryControllerState({
      getDayEntryEpoch: () => "d".repeat(32),
      getSelectedPeriodId: () => summary.periodId,
      getSummary: () => summary,
      historyController: {
        getMutationSequence: () => 0,
        loadHistory: () => {},
        loadHistoryEffect: () => Effect.void,
        resetHistories: () => {},
      },
      setSummary: () => {},
    });
    controller.openDayEntry({ date: summary.startDate });
    expect(parse).not.toHaveBeenCalled();
    controller.modalInputYen = " 0800 ";
    expect(controller.modalInputValue).toBe(800);
    expect(controller.modalPreviewAfterYen).toBe(1_000);
    controller.modalMemo = "下書き";
    controller.modalInputYen = " 0800 ";
    controller.setSelectedRow({ ...summary.dailyRows[0], usedYen: 300 });
    expect(controller.modalPreviewAfterYen).toBe(1_100);
    controller.closeDayEntry();
    controller.openDayEntry({ date: summary.endDate });
    expect(controller.modalInputValue).toBeNull();
    controller.closeDayEntry();
    controller.openDayEntry({ date: summary.startDate });
    expect(controller.modalInputYen).toBe(" 0800 ");
    expect(controller.modalInputValue).toBe(800);
    expect(controller.modalPreviewAfterYen).toBe(1_000);
    expect(parse).toHaveBeenCalledExactlyOnceWith(" 0800 ");

    controller.modalInputYen = "1e3";
    expect(controller.modalInputValue).toBeNull();
    controller.closeDayEntry();
    controller.openDayEntry({ date: summary.startDate });
    expect(controller.modalInputYen).toBe("1e3");
    expect(controller.modalInputValue).toBeNull();
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("checks a create budget only when its raw draft changes", () => {
    const parse = vi.spyOn(yenInput, "parseNonNegativeIntegerYenInput");
    const state = createPeriodCreateState({ startDate: "2026-07-12" });
    expect(state.createBudgetValue).toBe(120_000);
    state.createBudgetInput = "001000";
    expect(state.createBudgetValue).toBe(1_000);
    state.createBudgetInput = "001000";
    state.createPeriodId = "custom";
    state.setError("再試行");
    expect(state.createBudgetValue).toBe(1_000);
    expect(parse).toHaveBeenCalledExactlyOnceWith("001000");
    state.createBudgetInput = "9007199254740993";
    expect(state.createBudgetValue).toBeNull();
    state.resetDraft();
    expect(state.createBudgetValue).toBe(120_000);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("reuses budget validation for dirty checks, submissions and refreshed settings", () => {
    const parse = vi.spyOn(yenInput, "parseNonNegativeIntegerYenInput");
    let summary = createSummary(0);
    const settings = createPeriodSettingsState({
      getSummary: () => summary,
      getResetDisabled: () => false,
    });
    expect(settings.budget.dirty).toBe(false);
    expect(settings.validateBudget()).toBe(10_000);
    expect(parse).not.toHaveBeenCalled();
    settings.budget.draft = " 020000 ";
    settings.budget.draft = " 020000 ";
    expect(settings.budget.dirty).toBe(true);
    expect(settings.validateBudget()).toBe(20_000);
    expect(settings.validateBudget()).toBe(20_000);
    const next = { ...summary, budgetYen: 20_000 };
    settings.adopt(next, {
      operation: "budget",
      payload: {
        budgetYen: 20_000,
        startDate: summary.startDate,
        endDate: summary.endDate,
      },
    });
    summary = next;
    expect(settings.budget.dirty).toBe(false);
    expect(settings.validateBudget()).toBe(20_000);
    expect(parse).toHaveBeenCalledExactlyOnceWith(" 020000 ");

    settings.budget.draft = "1e3";
    expect(settings.validateBudget()).toBeNull();
    expect(settings.validateBudget()).toBeNull();
    expect(settings.budget.validationError).not.toBeNull();
    settings.budget.draft = "0";
    expect(settings.budget.validationError).toBeNull();
    expect(settings.validateBudget()).toBe(0);
    settings.budget.reset();
    expect(settings.validateBudget()).toBe(20_000);
    expect(parse).toHaveBeenCalledTimes(3);
  });
});

it("submits a cached create budget again after a save failure", async () => {
  const parse = vi.spyOn(yenInput, "parseNonNegativeIntegerYenInput");
  const summary = createSummary(0);
  const controller = createPeriodControllerState(
    {
      today: summary.startDate,
      periods: [],
      selectedPeriodId: null,
      summary: null,
    },
    createPeriodSummaryRevision(),
  );
  const fetchMock = vi.fn(async () => jsonResponse({ error: "失敗" }, 400));
  vi.stubGlobal("fetch", fetchMock);
  controller.createBudgetInput = "001000";
  controller.createInitialPeriod();
  await settled(executions[0]);
  controller.createInitialPeriod();
  await settled(executions[1]);
  expect(parse).toHaveBeenCalledExactlyOnceWith("001000");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [, options] of fetchMock.mock.calls as unknown as [
    unknown,
    RequestInit,
  ][]) {
    expect(JSON.parse(String(options.body)).budgetYen).toBe(1_000);
  }
});

describe("client range input boundary", () => {
  it("parses only edited text, sharing the result with settings and calendar", () => {
    const parse = vi.mocked(parseDate);
    parse.mockClear();
    const summary = createSummary(0);
    const settings = createPeriodSettingsState({
      getSummary: () => summary,
      getResetDisabled: () => false,
    });
    expect(settings.range.validation.isValid).toBe(true);
    expect(settings.validateRange()).toEqual(settings.range.draft);
    expect(parse).toHaveBeenCalledTimes(2);
    parse.mockClear();

    settings.range.edit({ ...settings.range.draft, endDate: "2026-07-15" });
    const validCalendar = settings.range.calendarValue;
    expect(settings.range.validation.isValid).toBe(true);
    settings.validateRange();
    settings.validateRange();
    settings.range.edit({ ...settings.range.draft });
    expect(settings.range.calendarValue).toBe(validCalendar);
    expect(parse).toHaveBeenCalledExactlyOnceWith("2026-07-15");

    settings.range.edit({ ...settings.range.draft, startDate: "2026-02-30" });
    expect(settings.range.validation.isValid).toBe(false);
    expect(settings.validateRange()).toBeNull();
    expect(settings.range.draft.startDate).toBe("2026-02-30");
    expect(settings.range.calendarValue.start).toBeUndefined();
    settings.range.edit({ ...settings.range.draft, startDate: "2026-07-12" });
    expect(settings.range.validation.isValid).toBe(true);
    expect(settings.range.calendarValue.end).toBe(validCalendar.end);
    expect(parse).toHaveBeenCalledTimes(3);
    settings.range.reset();
    expect(settings.validateRange()).toEqual({
      startDate: "2026-07-12",
      endDate: "2026-07-13",
    });
    expect(parse).toHaveBeenCalledTimes(3);
  });

  it("keeps date objects selected by the calendar without reparsing strings", () => {
    const parse = vi.mocked(parseDate);
    parse.mockClear();
    const state = createPeriodCreateState({ startDate: "2026-07-12" });
    expect(parse).toHaveBeenCalledTimes(2);
    parse.mockClear();
    const start = new CalendarDate(2026, 8, 1);
    const end = new CalendarDate(2026, 8, 30);
    state.updateRange(
      { startDate: start.toString(), endDate: "" },
      { start, end: undefined },
    );
    expect(state.createRangeInput.validation.isValid).toBe(false);
    expect(state.createRangeInput.calendarValue.start).toBe(start);
    state.updateRange(
      { startDate: start.toString(), endDate: end.toString() },
      { start, end },
    );
    expect(state.createRangeInput.validation.isValid).toBe(true);
    expect(state.createRangeInput.calendarValue.end).toBe(end);
    expect(parse).not.toHaveBeenCalled();
    state.updateRange({ startDate: start.toString(), endDate: "bad" });
    expect(state.createRangeInput.validation.isValid).toBe(false);
    expect(parse).toHaveBeenCalledExactlyOnceWith("bad");
    state.resetDraft();
    expect(state.createRangeInput.validation.isValid).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
  });
});

it("rejects malformed API summary fields when they enter editable state", () => {
  const summary = {
    ...createSummary(0),
    budgetYen: NaN,
    startDate: "2026-02-30",
  };
  const settings = createPeriodSettingsState({
    getSummary: () => summary,
    getResetDisabled: () => false,
  });
  expect(settings.validateBudget()).toBeNull();
  expect(settings.range.validation.startError).not.toBeNull();
  expect(settings.range.calendarValue.start).toBeUndefined();
  expect(settings.range.draft.startDate).toBe("2026-02-30");
  expect(settings.validateRange()).toBeNull();
  settings.budget.draft = "500";
  settings.budget.reset();
  expect(settings.validateBudget()).toBeNull();
});

it.each([
  { budgetYen: "1000", startDate: "2026-02-30", endDate: "2026-07-13" },
  { budgetYen: -1, startDate: "2026-07-15", endDate: "2026-07-12" },
  {
    budgetYen: Number.MAX_SAFE_INTEGER + 1,
    startDate: 123,
    endDate: "2026-07-13",
  },
  { budgetYen: {}, startDate: "2026-07-12", endDate: null },
])("rejects invalid API values on adoption: %j", (fields) => {
  let summary = createSummary(0);
  const settings = createPeriodSettingsState({
    getSummary: () => summary,
    getResetDisabled: () => false,
  });
  const next = { ...summary, ...fields } as unknown as typeof summary;
  settings.adopt(next);
  summary = next;
  expect(settings.validateBudget()).toBeNull();
  expect(settings.validateRange()).toBeNull();
  expect(settings.range.validation.isValid).toBe(false);
  settings.budget.reset();
  settings.range.reset();
  expect(settings.validateBudget()).toBeNull();
  expect(settings.validateRange()).toBeNull();
});
