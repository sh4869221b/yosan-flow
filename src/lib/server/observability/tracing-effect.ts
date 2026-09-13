import { Effect, Runtime } from "effect";
import type { CustomSpanAttributes, CustomSpanName } from "./span-schema";
import type { TracingAdapter } from "./tracing";

export function withTracingEffect<A>(
  tracing: TracingAdapter,
  name: CustomSpanName,
  effect: Effect.Effect<A, Error>,
  attributes?: () => CustomSpanAttributes,
): Effect.Effect<A, Error> {
  return Effect.flatMap(Effect.runtime(), (runtime) =>
    Effect.async<A, Error>((resume, signal) => {
      const completion = tracing.withSpan(
        name,
        () => Runtime.runPromiseExit(runtime)(effect, { signal }),
        attributes,
      );
      void completion.then(resume);
      // Interruption aborts the inner fiber and waits for its finalizers.
      return Effect.promise(() => completion).pipe(Effect.asVoid);
    }),
  );
}
