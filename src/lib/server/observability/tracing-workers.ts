import { tracing } from "cloudflare:workers";
import { createTracing } from "./tracing";

export const workersTracing = createTracing(tracing);
