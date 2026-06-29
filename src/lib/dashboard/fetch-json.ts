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
    return yield* Effect.tryPromise<T, string>({
      try: () => response.json(),
      catch: () => fallbackError,
    });
  });
}
