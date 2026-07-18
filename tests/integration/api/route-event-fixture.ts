import type { RequestHandler } from "@sveltejs/kit";

type RouteEvent = Parameters<RequestHandler>[0];

export type RouteEventInput = Readonly<
  Pick<RouteEvent, "params" | "platform" | "request">
>;

function createNoopSpan(): RouteEvent["tracing"]["root"] {
  const span = {
    spanContext: () => ({ traceId: "", spanId: "", traceFlags: 0 }),
    setAttribute() {
      return span;
    },
    setAttributes() {
      return span;
    },
    addEvent() {
      return span;
    },
    setStatus() {
      return span;
    },
    updateName() {
      return span;
    },
    end() {},
    isRecording: () => false,
    recordException() {
      return span;
    },
    addLink() {
      return span;
    },
    addLinks() {
      return span;
    },
  } satisfies RouteEvent["tracing"]["root"];
  return span;
}

export function createRouteEvent(input: RouteEventInput): RouteEvent {
  const span = createNoopSpan();
  return {
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: (name, value) => `${name}=${encodeURIComponent(value)}`,
    },
    fetch,
    getClientAddress: () => "127.0.0.1",
    locals: {},
    params: input.params,
    platform: input.platform,
    request: input.request,
    route: { id: null },
    setHeaders: () => {},
    url: new URL(input.request.url),
    isDataRequest: false,
    isSubRequest: false,
    tracing: { enabled: false, root: span, current: span },
    isRemoteRequest: false,
  } satisfies RouteEvent;
}
