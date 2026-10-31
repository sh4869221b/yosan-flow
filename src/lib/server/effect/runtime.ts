import { Cause, Effect, Exit, Result } from "effect";

export function toEffectError(error: unknown): Error {
  return error instanceof Error ? error : new Error("Unknown Effect failure");
}

export async function runApiEffect<T>(
  effect: Effect.Effect<T, Error>,
): Promise<T> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  // A defect may include an elected route error. Never classify it as a 4xx,
  // or lose finalizer/sibling failures by squashing the cause to one value.
  if (!Cause.hasDies(exit.cause) && !Cause.hasInterrupts(exit.cause)) {
    const error = Cause.findError(exit.cause);
    if (Result.isSuccess(error)) {
      throw error.success;
    }
  }
  throw new Error("Unexpected Effect failure", { cause: exit.cause });
}
