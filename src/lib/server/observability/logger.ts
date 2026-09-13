import { sanitizeEvent, type TelemetryEvent } from "./schema";

export function createLogger(
  sink: (event: TelemetryEvent) => void = (event) => console.log(event),
) {
  return {
    log(input: unknown): void {
      const event = sanitizeEvent(input);
      if (event !== undefined) sink(event);
    },
  };
}
