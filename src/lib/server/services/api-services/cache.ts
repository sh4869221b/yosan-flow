import type { D1Database } from "$lib/server/db/d1-types";
import { createD1ApiServices } from "./d1";
import { createInMemoryApiServices } from "./in-memory";
import type { ApiServicesGlobalCache, InMemoryApiServices } from "./types";

const apiServicesCacheKey = Symbol.for("yosan-flow.api-services-cache");

function getApiServicesGlobalCache(): ApiServicesGlobalCache {
  const runtimeHost =
    (globalThis as { process?: unknown }).process ?? (globalThis as unknown);
  const cacheHost = runtimeHost as Record<string | symbol, unknown>;
  const existing = cacheHost[apiServicesCacheKey] as
    ApiServicesGlobalCache | undefined;
  if (existing) {
    return existing;
  }

  const created: ApiServicesGlobalCache = {};
  cacheHost[apiServicesCacheKey] = created;
  return created;
}

function getDefaultInMemoryApiServices(): InMemoryApiServices {
  const cache = getApiServicesGlobalCache();
  const existing = cache.defaultInMemoryApiServices;
  if (existing) {
    return existing;
  }

  const created = createInMemoryApiServices();
  cache.defaultInMemoryApiServices = created;
  return created;
}

function getD1BindingScopedApiServices(db: D1Database): InMemoryApiServices {
  const cache = getApiServicesGlobalCache();
  const d1BindingScopedServices =
    cache.d1BindingScopedServices ??
    (cache.d1BindingScopedServices = new WeakMap());
  const existing = d1BindingScopedServices.get(db);
  if (existing) {
    return existing;
  }

  const created = createD1ApiServices(db);
  d1BindingScopedServices.set(db, created);
  return created;
}

export function getApiServicesFromPlatform(
  platform?: App.Platform,
): InMemoryApiServices {
  const runtimeProcess = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  if (runtimeProcess?.env?.YOSAN_FLOW_FORCE_IN_MEMORY_DEV === "1") {
    return getDefaultInMemoryApiServices();
  }

  const db = platform?.env?.DB;
  if (!db) {
    if (platform) {
      throw new Error("D1 binding DB is required");
    }
    return getDefaultInMemoryApiServices();
  }

  return getD1BindingScopedApiServices(db);
}
