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
      if (!isCustomSpanName(operation)) {
        return callback();
      }

      return native.enterSpan(operation, (span) => {
        if (span.isTraced) {
          const event = sanitizeSpanAttributes(operation, attributes?.());
          if (event !== undefined) {
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
