import { tracing } from "cloudflare:workers";
import { createTracing, noopTracing, type TracingAdapter } from "./tracing";

export function getRequestTracing(): TracingAdapter {
  // Resolve the native facade at the request boundary, never in the D1 cache.
  return tracing === undefined ? noopTracing : createTracing(tracing);
}
