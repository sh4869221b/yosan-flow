import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "$lib/server/observability/logger";
import {
  sanitizeEvent,
  type TelemetryEvent,
} from "$lib/server/observability/schema";

const event = {
  event: "operation.completed",
  operation: "day.add",
  route: "/api/periods/[periodId]/days/[date]/add",
  method: "POST",
  outcome: "success",
  status: 200,
} satisfies TelemetryEvent;

afterEach(() => vi.restoreAllMocks());

describe("structured telemetry logger", () => {
  it("projects only the six own semantic fields without inspecting extra objects", () => {
    const sink = vi.fn();
    const extra = {
      amount: 1234,
      periodId: "secret-period",
      historyId: "secret-history",
      date: "2026-09-13",
      body: { userText: "private input" },
      authorization: "Bearer secret-token",
      cookie: "session=secret-cookie",
      error: new Error("private message and stack"),
      toJSON: vi.fn(() => {
        throw new Error("must not serialize");
      }),
    };
    const input = {
      ...event,
      extra,
      ...extra,
      get request() {
        throw new Error("must not read extra getters");
      },
    };

    createLogger(sink).log(input);

    expect(sink.mock.calls).toEqual([[event]]);
    expect(sink.mock.calls[0]?.[0] === input).toBe(false);
    expect(extra.toJSON).not.toHaveBeenCalled();
  });

  it("emits one structured object through the default console sink", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

    createLogger().log({ ...event, body: "secret-body" });

    expect(consoleLog.mock.calls).toEqual([[event]]);
  });

  it.each([
    { event: "secret-event" },
    { operation: "period.read.secret-id" },
    { route: "/api/periods/secret-id?token=secret-token" },
    { method: "secret-method" },
    { outcome: "secret-error" },
    { status: 99 },
    { status: 600 },
    { status: 200.5 },
    { status: Number.NaN },
    { status: Infinity },
    { status: "200" },
    { status: undefined },
  ])("omits invalid required fields: %j", (invalid) => {
    const sink = vi.fn();

    createLogger(sink).log({ ...event, ...invalid });

    expect(sink).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "secret-input", new Error("private-error"), {}])(
    "rejects input without the required own fields: %j",
    (input) => {
      expect(sanitizeEvent(input)).toBeUndefined();
    },
  );

  it("rejects inherited required fields", () => {
    const input = Object.create(event);

    expect(sanitizeEvent(input)).toBeUndefined();
  });

  it.each([100, 599])(
    "accepts HTTP status boundary %i and the unknown route",
    (status) => {
      const input = { ...event, route: "unknown", status };

      expect(sanitizeEvent(input)).toEqual(input);
    },
  );

  it("propagates sink errors unchanged", () => {
    const error = new Error("sink failed");
    const logger = createLogger(() => {
      throw error;
    });

    expect(() => logger.log(event)).toThrow(error);
  });
});
