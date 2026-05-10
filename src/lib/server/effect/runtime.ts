import { Effect, Either } from "effect";

export function toEffectError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown Effect failure");
}

export async function runApiEffect<T>(
  effect: Effect.Effect<T, Error>,
): Promise<T> {
  const result = await Effect.runPromise(Effect.either(effect));
  if (Either.isLeft(result)) {
    throw result.left;
  }
  return result.right;
}
