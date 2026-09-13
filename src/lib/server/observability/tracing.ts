import {
  isOperation,
  sanitizeEvent,
  type Operation,
  type TelemetryEvent,
} from "./schema";

export interface TracingAdapter {
  withSpan<T>(
    operation: Operation,
    callback: () => T,
    attributes?: TelemetryEvent,
  ): T;
}

export interface NativeTracing {
  enterSpan<T>(
    name: string,
    callback: (span: {
      setAttribute(key: string, value: string | number): void;
    }) => T,
  ): T;
}

export function createTracing(native: NativeTracing): TracingAdapter {
  return {
    withSpan(operation, callback, attributes) {
      if (!isOperation(operation)) return callback();

      const event = sanitizeEvent(attributes);
      return native.enterSpan(operation, (span) => {
        if (event !== undefined && event.operation === operation) {
          for (const [key, value] of Object.entries(event)) {
            span.setAttribute(key, value);
          }
        }
        return callback();
      });
    },
  };
}

export const noopTracing: TracingAdapter = {
  withSpan(_operation, callback) {
    return callback();
  },
};
