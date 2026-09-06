import { Effect } from "effect";
import { afterEach, beforeEach, vi } from "vitest";
import * as clientEffect from "$lib/dashboard/client-effect";

export async function settled<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Controller signal timed out")),
          2_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function captureClientEffects() {
  const executions: Promise<void>[] = [];
  beforeEach(() => {
    vi.spyOn(clientEffect, "runClientEffect").mockImplementation((effect) => {
      executions.push(Effect.runPromise(effect));
    });
  });
  afterEach(async () => {
    try {
      await settled(Promise.all(executions));
    } finally {
      executions.length = 0;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
  return executions;
}
