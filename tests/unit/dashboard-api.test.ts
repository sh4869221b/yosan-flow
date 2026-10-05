import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dayAddUrl,
  dayHistoryUrl,
  historyItemUrl,
  periodSummaryUrl,
} from "#lib/dashboard/api-urls.ts";
import { fetchJsonEffect } from "#lib/dashboard/fetch-json.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

async function runFetchJsonResult<T>(
  response: Promise<Response>,
  fallback: string,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => response),
  );

  return Effect.runPromise(
    Effect.result(fetchJsonEffect<T>("/api/example", undefined, fallback)),
  );
}

describe("dashboard API URLs", () => {
  it("encodes all route path segments when identifiers contain reserved characters", () => {
    // Given
    const periodId = "period/with space?";
    const date = "2026-06-28#meal";
    const historyId = "history/id ?";

    // When / Then
    expect(periodSummaryUrl(periodId)).toBe(
      "/api/periods/period%2Fwith%20space%3F",
    );
    expect(dayHistoryUrl(periodId, date)).toBe(
      "/api/periods/period%2Fwith%20space%3F/days/2026-06-28%23meal/history",
    );
    expect(dayAddUrl(periodId, date)).toBe(
      "/api/periods/period%2Fwith%20space%3F/days/2026-06-28%23meal/add",
    );
    expect(historyItemUrl(periodId, date, historyId)).toBe(
      "/api/periods/period%2Fwith%20space%3F/days/2026-06-28%23meal/history/history%2Fid%20%3F",
    );
  });
});

describe("fetchJsonEffect", () => {
  it("returns parsed JSON when the response is successful", async () => {
    // Given
    const body = { periodId: "period-1", totalUsedYen: 1200 };

    // When
    const result = await runFetchJsonResult<typeof body>(
      Promise.resolve(jsonResponse(body)),
      "fallback",
    );

    // Then
    expect(result._tag).toBe("Success");
    if (result._tag === "Success") {
      expect(result.success).toEqual(body);
    }
  });

  it("returns structured error.message when a non-OK response provides one", async () => {
    // Given
    const body = { error: { message: "サーバー側のエラーです。" } };

    // When
    const result = await runFetchJsonResult<unknown>(
      Promise.resolve(jsonResponse(body, 400)),
      "fallback",
    );

    // Then
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("サーバー側のエラーです。");
    }
  });

  it("returns the fallback error when the non-OK error body is malformed", async () => {
    // Given
    const response = new Response("not-json", { status: 500 });

    // When
    const result = await runFetchJsonResult<unknown>(
      Promise.resolve(response),
      "fallback",
    );

    // Then
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("fallback");
    }
  });

  it("returns the fallback error when fetch rejects", async () => {
    // Given
    const rejection = Promise.reject(new Error("network down"));

    // When
    const result = await runFetchJsonResult<unknown>(rejection, "fallback");

    // Then
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("fallback");
    }
  });

  it("returns the fallback error when a successful response body is malformed", async () => {
    // Given
    const response = new Response("not-json", { status: 200 });

    // When
    const result = await runFetchJsonResult<unknown>(
      Promise.resolve(response),
      "fallback",
    );

    // Then
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBe("fallback");
    }
  });
});
