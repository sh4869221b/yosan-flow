import { Effect } from "effect";

export function runClientEffect(effect: Effect.Effect<void, never>): void {
  void Effect.runPromise(effect);
}

export function periodsUrl(): string {
  return "/api/periods";
}

export function periodSummaryUrl(periodId: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}`;
}

export function dayHistoryUrl(periodId: string, date: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history`;
}

export function dayAddUrl(periodId: string, date: string): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/add`;
}

export function historyItemUrl(
  periodId: string,
  date: string,
  historyId: string,
): string {
  return `/api/periods/${encodeURIComponent(periodId)}/days/${encodeURIComponent(date)}/history/${encodeURIComponent(historyId)}`;
}

export function parseApiErrorEffect(
  response: Response,
  fallback: string,
): Effect.Effect<string, never> {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: () => ({}),
  }).pipe(
    Effect.map((body) => {
      const errorMessage =
        typeof body === "object" &&
        body != null &&
        "error" in body &&
        typeof (body as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? (body as { error: { message: string } }).error.message
          : null;
      return errorMessage ?? fallback;
    }),
    Effect.catchAll(() => Effect.succeed(fallback)),
  );
}

export function fetchJsonEffect<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
): Effect.Effect<T, string> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, init),
      catch: () => fallbackError,
    });
    if (!response.ok) {
      return yield* Effect.fail(
        yield* parseApiErrorEffect(response, fallbackError),
      );
    }
    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => fallbackError,
    });
  });
}
