import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.mjs";

const expense = {
  periodId: "予算",
  date: "2026-11-26",
  inputYen: 100,
  memo: " 昼食 ",
  idempotencyKey: `${"a".repeat(32)}.dot_${"b".repeat(32)}`,
};

async function dispatch(body, fetch) {
  const result = [];
  await worker.queue(
    {
      messages: [
        {
          body,
          ack: () => result.push("ack"),
          retry: () => result.push("retry"),
        },
      ],
    },
    { YOSAN_ORIGIN: "https://example.test", YOSAN: { fetch } },
  );
  return result;
}

test("sends only the existing add API with the original idempotency key", async () => {
  assert.deepEqual(Object.keys(worker), ["queue"]);
  assert.deepEqual(
    await dispatch(expense, async (request) => {
      assert.equal(request.method, "POST");
      assert.equal(request.redirect, "manual");
      assert.equal(
        new URL(request.url).pathname,
        "/api/periods/%E4%BA%88%E7%AE%97/days/2026-11-26/add",
      );
      assert.equal(request.headers.get("origin"), "https://example.test");
      assert.equal(
        request.headers.get("idempotency-key"),
        expense.idempotencyKey,
      );
      assert.deepEqual(await request.json(), { inputYen: 100, memo: "昼食" });
      return new Response(null, { status: 204 });
    }),
    ["ack"],
  );
});

test("rejects operation overrides, invalid paths, and invalid amounts before the API", async () => {
  for (const extra of [
    { action: "delete" },
    { method: "DELETE" },
    { path: "/api/periods" },
    { periodId: ".." },
    { periodId: "%2e%2e" },
    { periodId: "x/y" },
    { date: "2026-11-26/overwrite" },
    { inputYen: -1 },
    { inputYen: 1.5 },
    { memo: "x".repeat(501) },
    { idempotencyKey: "arbitrary" },
  ]) {
    let calls = 0;
    assert.deepEqual(
      await dispatch({ ...expense, ...extra }, () => {
        calls++;
      }),
      ["ack"],
    );
    assert.equal(calls, 0);
  }
});

test("retries transient delivery failures and does not follow a redirect", async () => {
  for (const [status, expected] of [
    [302, "ack"],
    [400, "ack"],
    [409, "ack"],
    [412, "ack"],
    [429, "retry"],
    [503, "retry"],
  ]) {
    assert.deepEqual(
      await dispatch(expense, () => new Response(null, { status })),
      [expected],
    );
  }
  assert.deepEqual(
    await dispatch(expense, () => {
      throw Error("offline");
    }),
    ["retry"],
  );
});
