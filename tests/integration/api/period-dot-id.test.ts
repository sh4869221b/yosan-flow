import { expect, it } from "vitest";
import { createFixture } from "./periods-fixture";

it.each([".", ".."])("rejects creation of period %s", async (id) => {
  const fixture = createFixture();
  const create = await fixture.createPeriod({
    request: new Request("http://localhost/api/periods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 1000,
      }),
    }),
  } as Parameters<typeof fixture.createPeriod>[0]);
  expect(create.status).toBe(400);
  expect(await create.json()).toMatchObject({
    error: { code: "INVALID_PERIOD_ID" },
  });
});
