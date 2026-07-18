import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createD1BudgetPeriodRepository } from "$lib/server/db/budget-period-repository";
import {
  createInMemoryBudgetPeriodRepository,
  type BudgetPeriodRecord,
  type LinkedPeriodBoundaryUpdateCommand,
  type LinkedPeriodBoundaryUpdateResult,
} from "$lib/server/db/budget-period-repository";
import { createPeriodAwareD1Fake } from "../helpers/period-d1-fake";
import { runApiEffect } from "$lib/server/effect/runtime";

const target: BudgetPeriodRecord = {
  id: "target",
  startDate: "2026-06-21",
  endDate: "2026-07-20",
  budgetYen: 100_000,
  status: "active",
  predecessorPeriodId: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const successor: BudgetPeriodRecord = {
  id: "successor",
  startDate: "2026-07-21",
  endDate: "2026-08-19",
  budgetYen: 120_000,
  status: "closed",
  predecessorPeriodId: target.id,
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const command: LinkedPeriodBoundaryUpdateCommand = {
  target: {
    before: target,
    after: { ...target, endDate: "2026-07-21" },
  },
  successor: {
    before: successor,
    after: { ...successor, startDate: "2026-07-22" },
  },
  nowIso: "2026-07-18T00:00:00.000Z",
};

type Seed = {
  readonly periods?: readonly BudgetPeriodRecord[];
  readonly totalDates?: Readonly<Record<string, readonly string[]>>;
  readonly historyDates?: Readonly<Record<string, readonly string[]>>;
  readonly linkedBoundaryChangesOverride?: number;
};

type Harness = {
  readonly update: (
    input: LinkedPeriodBoundaryUpdateCommand,
  ) => Promise<LinkedPeriodBoundaryUpdateResult>;
  readonly readPair: () => Promise<
    readonly [BudgetPeriodRecord, BudgetPeriodRecord]
  >;
};

type Implementation = "d1" | "in-memory";

function toD1Row(period: BudgetPeriodRecord) {
  return {
    id: period.id,
    start_date: period.startDate,
    end_date: period.endDate,
    budget_yen: period.budgetYen,
    status: period.status,
    predecessor_period_id: period.predecessorPeriodId,
    created_at: period.createdAt,
    updated_at: period.updatedAt,
  };
}

function createHarness(
  implementation: Implementation,
  seed: Seed = {},
): Harness {
  const periods = [...(seed.periods ?? [target, successor])];
  if (implementation === "d1") {
    const preparedSql: string[] = [];
    const db = createPeriodAwareD1Fake(preparedSql, {
      periods: periods.map(toD1Row),
      totalDates: seed.totalDates,
      historyDates: seed.historyDates,
      linkedBoundaryChangesOverride: seed.linkedBoundaryChangesOverride,
    });
    const repository = createD1BudgetPeriodRepository({ db });
    return {
      update: (input) => runApiEffect(repository.updateLinkedBoundary(input)),
      readPair: async () => readPair(repository),
    };
  }

  const repository = createInMemoryBudgetPeriodRepository(periods, {
    listOwnedEntryDates: () => ({
      totalDates: seed.totalDates ?? {},
      historyDates: seed.historyDates ?? {},
    }),
    runSerializedEffect: (work) => work(),
  });
  return {
    update: (input) => runApiEffect(repository.updateLinkedBoundary(input)),
    readPair: async () => readPair(repository),
  };
}

async function readPair(
  repository: ReturnType<typeof createInMemoryBudgetPeriodRepository>,
): Promise<readonly [BudgetPeriodRecord, BudgetPeriodRecord]> {
  const targetRecord = await Effect.runPromise(repository.findById(target.id));
  const successorRecord = await Effect.runPromise(
    repository.findById(successor.id),
  );
  if (!targetRecord || !successorRecord) {
    throw new Error("period persistence fixture lost its linked pair");
  }
  return [targetRecord, successorRecord];
}

const implementations: readonly Implementation[] = ["d1", "in-memory"];

describe("linked period boundary persistence", () => {
  it.each(implementations)(
    "atomically updates exactly two linked periods with %s",
    async (implementation) => {
      // Given one continuous linked pair with unchanged full snapshots
      const harness = createHarness(implementation);

      // When the shared linked-boundary command is executed
      const result = await harness.update(command);

      // Then exactly two records move while successor-owned values stay unchanged
      expect(result.changedCount).toBe(2);
      expect(result.target).toMatchObject({ endDate: "2026-07-21" });
      expect(result.successor).toMatchObject({
        startDate: "2026-07-22",
        endDate: successor.endDate,
        budgetYen: successor.budgetYen,
        status: successor.status,
      });
      await expect(harness.readPair()).resolves.toEqual([
        result.target,
        result.successor,
      ]);
    },
  );

  it.each(implementations)(
    "leaves both periods unchanged for every conditional miss with %s",
    async (implementation) => {
      // Given stale, structurally invalid, overlapping, and daily-state races
      const predecessor = {
        ...target,
        id: "predecessor",
        startDate: "2026-05-21",
        endDate: "2026-06-20",
      };
      const linkedTarget = { ...target, predecessorPeriodId: predecessor.id };
      const linkedCommand = {
        ...command,
        target: { ...command.target, before: linkedTarget },
      };
      const conflicts: readonly {
        readonly name: string;
        readonly seed?: Seed;
        readonly input?: LinkedPeriodBoundaryUpdateCommand;
      }[] = [
        {
          name: "stale full successor snapshot",
          input: {
            ...command,
            successor: {
              ...command.successor,
              before: { ...successor, budgetYen: successor.budgetYen + 1 },
            },
          },
        },
        {
          name: "multiple linked successors",
          seed: {
            periods: [target, successor, { ...successor, id: "successor-2" }],
          },
        },
        {
          name: "predecessor changed after preview",
          seed: {
            periods: [
              { ...predecessor, endDate: "2026-06-19" },
              linkedTarget,
              successor,
            ],
          },
          input: linkedCommand,
        },
        {
          name: "predecessor absent after preview",
          seed: { periods: [linkedTarget, successor] },
          input: linkedCommand,
        },
        {
          name: "proposed ranges are not continuous",
          input: {
            ...command,
            successor: {
              ...command.successor,
              after: { ...successor, startDate: "2026-07-23" },
            },
          },
        },
        {
          name: "proposed range is malformed",
          input: {
            ...command,
            successor: {
              ...command.successor,
              after: { ...successor, startDate: "2026-08-20" },
            },
          },
        },
        {
          name: "third period overlaps a proposed range",
          seed: {
            periods: [
              target,
              successor,
              { ...target, id: "third", startDate: "2026-07-21" },
            ],
          },
        },
        {
          name: "post-preview daily total is displaced",
          seed: { totalDates: { [successor.id]: ["2026-07-21"] } },
        },
        {
          name: "post-preview history is displaced",
          seed: { historyDates: { [successor.id]: ["2026-07-21"] } },
        },
      ];

      // When each command observes a gate miss
      for (const conflict of conflicts) {
        const harness = createHarness(implementation, conflict.seed);
        const before = await harness.readPair();
        const failure = harness.update(conflict.input ?? command);

        // Then it reports a typed conflict and preserves both records
        await expect(failure, conflict.name).rejects.toMatchObject({
          code: "PERIOD_UPDATE_CONFLICT",
        });
        await expect(harness.readPair(), conflict.name).resolves.toEqual(
          before,
        );
      }
    },
  );

  it("rejects an impossible one-row D1 result without accepting partial state", async () => {
    // Given a fake that reports an impossible affected-row count
    const harness = createHarness("d1", { linkedBoundaryChangesOverride: 1 });
    const before = await harness.readPair();

    // When the single CASE statement reports one changed row
    const failure = harness.update(command);

    // Then the repository raises its invariant error and accepts no partial state
    await expect(failure).rejects.toMatchObject({
      code: "LINKED_PERIOD_BOUNDARY_INVARIANT",
    });
    await expect(harness.readPair()).resolves.toEqual(before);
  });
});
