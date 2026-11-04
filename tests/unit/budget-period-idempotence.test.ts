import { describe, expect, it } from "vitest";
import { createInMemoryBudgetPeriodRepository } from "#lib/server/db/budget-period-in-memory-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";

const originalInput = {
  id: "existing",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  budgetYen: 100_000,
  nowIso: "2026-05-01T00:00:00.000Z",
};

async function setup() {
  const repository = createInMemoryBudgetPeriodRepository();
  const original = await runApiEffect(repository.createPeriod(originalInput));
  return { repository, original };
}

describe("budget period create idempotence", () => {
  it.each(["missing", "existing"])(
    "returns the stored period before validating predecessor %s on a retry",
    async (predecessorPeriodId) => {
      const { repository, original } = await setup();
      const result = await runApiEffect(
        repository.createPeriod({
          ...originalInput,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          budgetYen: 200_000,
          predecessorPeriodId,
          nowIso: "2026-07-01T00:00:00.000Z",
        }),
      );

      expect(result).toEqual(original);
      result.budgetYen = 0;
      await expect(runApiEffect(repository.listPeriods())).resolves.toEqual([
        original,
      ]);
    },
  );

  it.each([
    ["missing", "PERIOD_PREDECESSOR_NOT_FOUND"],
    ["existing", "PERIOD_CONTINUITY_VIOLATION"],
  ])(
    "still rejects predecessor %s for a fresh ID",
    async (predecessorPeriodId, code) => {
      const { repository, original } = await setup();

      await expect(
        runApiEffect(
          repository.createPeriod({
            ...originalInput,
            id: "fresh",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
            predecessorPeriodId,
          }),
        ),
      ).rejects.toMatchObject({ code });
      await expect(runApiEffect(repository.listPeriods())).resolves.toEqual([
        original,
      ]);
    },
  );

  it.each([
    { budgetYen: -1 },
    { budgetYen: 1.5 },
    { startDate: "2026-06-01" },
    { startDate: "invalid" },
  ])("rejects invalid base input on a duplicate ID: %j", async (invalid) => {
    const { repository, original } = await setup();

    await expect(
      runApiEffect(repository.createPeriod({ ...originalInput, ...invalid })),
    ).rejects.toThrow();
    await expect(
      runApiEffect(repository.findById(original.id)),
    ).resolves.toEqual(original);
  });
});
