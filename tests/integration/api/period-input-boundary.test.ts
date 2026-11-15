import { describe, expect, it } from "vitest";
import { createFixture } from "./periods-fixture";

const valid = {
  id: "existing",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  budgetYen: 100_000,
};

describe("period request input boundary", () => {
  it.each([
    [{ budgetYen: -1 }, "INVALID_AMOUNT"],
    [{ budgetYen: 1.5 }, "INVALID_AMOUNT"],
    [{ budgetYen: Number.MAX_SAFE_INTEGER + 1 }, "INVALID_AMOUNT"],
    [{ startDate: "2026-06-01" }, "INVALID_PERIOD_RANGE"],
    [{ startDate: "invalid" }, "INVALID_DATE"],
    [{ startDate: ["2026-05-01"] }, "INVALID_DATE"],
    [{ startDate: { date: "2026-05-01" } }, "INVALID_DATE"],
    [{ endDate: 20260531 }, "INVALID_DATE"],
  ])(
    "rejects invalid fields even on a duplicate ID: %j",
    async (invalid, code) => {
      const fixture = createFixture();
      const post = (body: unknown) =>
        fixture.createPeriod({
          request: new Request("http://localhost/api/periods", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
        } as any);
      expect((await post(valid)).status).toBe(201);
      const response = await post({ ...valid, ...invalid });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code } });
      const periods = (await (await fixture.listPeriods({} as any)).json()) as {
        periods: unknown[];
      };
      expect(periods.periods).toHaveLength(1);
      expect(periods.periods[0]).toMatchObject(valid);
    },
  );
});

it("rejects a reversed range on update at the request boundary", async () => {
  const fixture = createFixture();
  const response = await fixture.updatePeriod({
    params: { periodId: valid.id },
    request: new Request("http://localhost/api/periods/existing", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...valid, startDate: "2026-06-01" }),
    }),
  } as any);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "INVALID_PERIOD_RANGE" },
  });
});
