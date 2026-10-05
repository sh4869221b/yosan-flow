import { describe, expect, it } from "vitest";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createFixture } from "./periods-fixture";

describe("period CRUD APIs", () => {
  it("creates and lists periods", async () => {
    const fixture = createFixture();

    const createResponse = await fixture.createPeriod({
      request: new Request("http://localhost/api/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p-2026-04",
          startDate: "2026-04-20",
          endDate: "2026-05-19",
          budgetYen: 100000,
        }),
      }),
    } as any);
    expect(createResponse.status).toBe(201);

    const listResponse = await fixture.listPeriods({
      request: new Request("http://localhost/api/periods", { method: "GET" }),
    } as any);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      periods: [{ id: "p-2026-04" }],
    });
  });

  it("updates period by PUT /api/periods/:periodId", async () => {
    const fixture = createFixture();
    await runApiEffect(
      fixture.services.createPeriod({
        id: "p-put",
        startDate: "2026-04-20",
        endDate: "2026-05-19",
        budgetYen: 100000,
      }),
    );

    const putResponse = await fixture.updatePeriod({
      params: { periodId: "p-put" },
      request: new Request("http://localhost/api/periods/p-put", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-04-21",
          endDate: "2026-05-20",
          budgetYen: 120000,
        }),
      }),
    } as any);

    expect(putResponse.status).toBe(200);
    await expect(putResponse.json()).resolves.toMatchObject({
      startDate: "2026-04-21",
      endDate: "2026-05-20",
      budgetYen: 120000,
    });
  });
});
