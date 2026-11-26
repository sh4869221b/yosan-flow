# Dot expense intake

Dot uses the already connected Cloudflare API to enqueue an explicitly requested expense. A private queue consumer calls the existing Yosan Flow add-expense API via a Workers service binding. It does not expose HTTP, hold a browser session, add an Access bypass policy, or bind D1. It cannot dispatch another method or operation based on a message. No runtime dependency or database migration is required.

Create separate preview and production queues and private consumers. Set `YOSAN` to the matching Yosan Flow Worker service, `YOSAN_ORIGIN` to the matching HTTPS app origin, and disable workers.dev and preview URLs on the consumer. Bind only the same environment's queue. No custom domain is needed.

## Message and result

The queue accepts JSON with only `periodId`, `date` (JST civil date), `inputYen` (positive integer), optional `memo` (trimmed, at most 500 characters), and `idempotencyKey`. Resolve the period and read the existing key epoch before sending, then use `<epoch>.dot_<uuid-without-hyphens>`. Do not retry with a different key if delivery is uncertain. Do not reuse a key for different values. No credentials should be put in a message.

A successful enqueue is not confirmation of a saved expense. Read the application's existing receipt for the exact key using the matching D1 environment; also compare the receipt fingerprint with the expected SHA-256 of `JSON.stringify([periodId,date,"add",inputYen,normalizedMemo])`. If no receipt exists, do not report success. Terminal app rejections are acknowledged without printing response bodies. Network errors, HTTP 429, and 5xx are retried using the same key; other responses are not retried. Logs must not include financial payloads, response bodies, or identifiers.

Disable or remove the named queue consumer to stop future processing without touching the main app or its Access policy. Account-level Cloudflare connector permissions are separate from the consumer's fixed functionality.
