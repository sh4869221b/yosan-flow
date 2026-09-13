import {
  isOperation,
  sanitizeEvent,
  type Operation,
  type TelemetryEvent,
} from "./schema";
import {
  isCustomSpanName,
  sanitizeSpanAttributes,
  type CustomSpanAttributes,
  type CustomSpanName,
} from "./span-schema";

export interface TracingAdapter {
  withSpan<T>(
    name: CustomSpanName,
    callback: () => T,
    attributes?: () => CustomSpanAttributes,
  ): T;
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
      readonly isTraced: boolean;
      setAttribute(key: string, value: string | number): void;
    }) => T,
  ): T;
}

export function createTracing(native: NativeTracing): TracingAdapter {
  return {
    withSpan(operation, callback, attributes) {
      if (!isOperation(operation) && !isCustomSpanName(operation)) {
        return callback();
      }

      return native.enterSpan(operation, (span) => {
        if (span.isTraced) {
          const event = isCustomSpanName(operation)
            ? sanitizeSpanAttributes(
                operation,
                typeof attributes === "function" ? attributes() : undefined,
              )
            : sanitizeEvent(attributes);
          if (
            event !== undefined &&
            (!("operation" in event) || event.operation === operation)
          ) {
            for (const [key, value] of Object.entries(event)) {
              span.setAttribute(key, value);
            }
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
