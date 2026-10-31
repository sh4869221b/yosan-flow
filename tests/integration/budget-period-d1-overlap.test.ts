import { describe, expect, it } from "vitest";
import { createD1BudgetPeriodRepository } from "#lib/server/db/budget-period-d1-repository.ts";
import { runApiEffect } from "#lib/server/effect/runtime.ts";
import { createPeriodAwareD1Fake } from "./helpers/period-d1-fake";

const nowIso = "2026-05-01T00:00:00.000Z";

function createRepository() {
  return createD1BudgetPeriodRepository({ db: createPeriodAwareD1Fake() });
}

type Repository = ReturnType<typeof createRepository>;

async function seedPeriod(
  repository: Repository,
  id: string,
  startDate: string,
  endDate: string,
) {
  return runApiEffect(
    repository.createPeriod({
      id,
      startDate,
      endDate,
      budgetYen: 100_000,
      nowIso,
    }),
  );
}

describe.each(["createPeriod", "updatePeriod"] as const)(
  "D1 %s overlap validation",
  (method) => {
    it.each([
      ["inside", "2026-05-15", "2026-05-16"],
      ["enclosing", "2026-05-09", "2026-05-21"],
      ["same range", "2026-05-10", "2026-05-20"],
      ["end equals existing start", "2026-05-01", "2026-05-10"],
      ["start equals existing end", "2026-05-20", "2026-05-31"],
    ])("rejects %s without writing", async (_name, startDate, endDate) => {
      const repository = createRepository();
      if (method === "updatePeriod") {
        await seedPeriod(repository, "target", "2026-05-01", "2026-05-09");
      }
      await seedPeriod(repository, "existing", "2026-05-10", "2026-05-20");
      const before = await runApiEffect(repository.listPeriods());

      await expect(
        runApiEffect(
          repository[method]({
            id: "target",
            startDate,
            endDate,
            budgetYen: 120_000,
            nowIso,
          }),
        ),
      ).rejects.toMatchObject({
        code: "PERIOD_OVERLAP",
        message: "budget period overlap: target overlaps existing",
      });
      await expect(runApiEffect(repository.listPeriods())).resolves.toEqual(
        before,
      );
    });

    it.each([
      ["day before", "2026-05-01", "2026-05-09"],
      ["day after", "2026-05-21", "2026-05-31"],
    ])("allows an adjacent range %s", async (_name, startDate, endDate) => {
      const repository = createRepository();
      await seedPeriod(repository, "existing", "2026-05-10", "2026-05-20");
      if (method === "updatePeriod") {
        await seedPeriod(repository, "target", "2026-05-01", "2026-05-09");
      }

      await expect(
        runApiEffect(
          repository[method]({
            id: "target",
            startDate,
            endDate,
            budgetYen: 120_000,
            nowIso,
          }),
        ),
      ).resolves.toMatchObject({ id: "target", startDate, endDate });
    });
  },
);

it("updates its own unchanged range without a false overlap", async () => {
  const repository = createRepository();
  const original = await seedPeriod(
    repository,
    "self",
    "2026-05-10",
    "2026-05-20",
  );
  const input = {
    id: original.id,
    startDate: original.startDate,
    endDate: original.endDate,
    budgetYen: 120_000,
    nowIso: "2026-05-02T00:00:00.000Z",
  };

  const updated = await runApiEffect(repository.updatePeriod(input));

  expect(updated).toEqual({
    ...original,
    budgetYen: input.budgetYen,
    updatedAt: input.nowIso,
  });
  await expect(runApiEffect(repository.findById(original.id))).resolves.toEqual(
    updated,
  );
});
