import { Effect } from "effect";

export function runClientEffect(effect: Effect.Effect<void, never>): void {
  void Effect.runPromise(effect);
}
