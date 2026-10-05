import { Effect, Result } from "effect";

export function toEffectError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown Effect failure");
}

export async function runApiEffect<T>(
  effect: Effect.Effect<T, Error>,
): Promise<T> {
  const result = await Effect.runPromise(Effect.result(effect));
  if (Result.isFailure(result)) {
    throw result.failure;
  }
  return result.success;
}
