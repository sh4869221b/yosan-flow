// Stable Vitest-only target for the cloudflare:workers factory in setup-cloudflare.
// Fail closed if the setup mock is accidentally omitted; never provide bindings.
throw new Error("Load tests/setup-cloudflare.ts before Workers runtime tests");
export {};
