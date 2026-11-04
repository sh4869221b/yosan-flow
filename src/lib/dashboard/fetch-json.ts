import { Effect } from "effect";

function getApiErrorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body == null || !("error" in body)) {
    return null;
  }
  const { error } = body;
  if (typeof error !== "object" || error == null || !("message" in error)) {
    return null;
  }
  const { message } = error;
  return typeof message === "string" ? message : null;
}

function parseApiErrorEffect(
  response: Response,
  fallback: string,
): Effect.Effect<string, never> {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: () => ({}),
  }).pipe(
    Effect.map((body) => getApiErrorMessage(body) ?? fallback),
    Effect.catch(() => Effect.succeed(fallback)),
  );
}

function requestJsonEffect<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
): Effect.Effect<T, string> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { ...init, cache: "no-store" }),
      catch: () => fallbackError,
    });
    if (!response.ok) {
      return yield* Effect.fail(
        yield* parseApiErrorEffect(response, fallbackError),
      );
    }
    return yield* Effect.tryPromise<T, string>({
      try: () => response.json(),
      catch: () => fallbackError,
    });
  });
}

export function fetchJsonEffect<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
): Effect.Effect<T, string> {
  return Effect.suspend(() => {
    const method = init?.method?.toUpperCase() ?? "GET";
    // Read fibers can lose a modal-session race; mutations may still commit
    // after interruption and retain their existing caller-owned cancellation.
    if (method !== "GET" && method !== "HEAD") {
      return requestJsonEffect<T>(url, init, fallbackError);
    }

    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    return requestJsonEffect<T>(
      url,
      { ...init, signal: controller.signal },
      fallbackError,
    ).pipe(
      Effect.onInterrupt(() => Effect.sync(() => controller.abort())),
      Effect.ensuring(
        Effect.sync(() =>
          callerSignal?.removeEventListener("abort", abortFromCaller),
        ),
      ),
    );
  });
}
