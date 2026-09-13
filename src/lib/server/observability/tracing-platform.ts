import { createTracing, noopTracing, type TracingAdapter } from "./tracing";

export function getRequestTracing(
  platform: App.Platform | undefined,
): TracingAdapter {
  const native = platform?.ctx?.tracing;
  return native === undefined ? noopTracing : createTracing(native);
}
