import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";
import { createPeriodAwarePreparedStatement } from "./prepared-statement";
import { createPeriodAwareD1FakeState } from "./table-state";

export function createPeriodAwareD1Fake(
  preparedSql: string[] = [],
): D1Database {
  const state = createPeriodAwareD1FakeState();

  return {
    prepare(sql: string) {
      preparedSql.push(sql);
      return createPeriodAwarePreparedStatement(sql, state);
    },
    async batch<T = unknown>(
      statements: D1PreparedStatement[],
    ): Promise<D1Result<T>[]> {
      const snapshot = state.snapshot();
      try {
        for (const statement of statements) {
          await statement.run();
        }
      } catch (error) {
        state.restore(snapshot);
        throw error;
      }
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    withSession() {
      throw new Error("D1 sessions are not implemented in this test fake");
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}
