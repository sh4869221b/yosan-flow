import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { D1Database, D1PreparedStatement } from "$lib/server/db/d1-types";

function binding(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error("Unsupported SQLite D1 test binding");
}

/** Runs application SQL unchanged; this is not a SQL-pattern-dispatch fake. */
export function createSqliteD1(db: DatabaseSync): D1Database {
  const executors = new WeakMap<D1PreparedStatement, () => D1Result>();

  function prepare(
    sql: string,
    args: SQLInputValue[] = [],
  ): D1PreparedStatement {
    const query = db.prepare(sql);
    if (sql.slice(query.sourceSQL.length).trim()) {
      throw new Error(
        "SQLite D1 test statements must contain one SQL statement",
      );
    }

    function execute<T>(mode: "all" | "run"): D1Result<T> {
      const before = Number(db.prepare("SELECT total_changes() AS n").get()?.n);
      query.setReturnArrays(false);
      const results =
        mode === "all" ? query.all(...args) : (query.run(...args), []);
      const changes =
        Number(db.prepare("SELECT total_changes() AS n").get()?.n) - before;
      return {
        success: true,
        results: results as T[],
        meta: {
          duration: 0,
          size_after: 0,
          rows_read: results.length,
          rows_written: changes,
          last_row_id: Number(
            db.prepare("SELECT last_insert_rowid() AS n").get()?.n,
          ),
          changed_db: changes > 0,
          changes,
        },
      };
    }

    function raw<T = unknown[]>(options: {
      columnNames: true;
    }): Promise<[string[], ...T[]]>;
    function raw<T = unknown[]>(options?: {
      columnNames?: false;
    }): Promise<T[]>;
    async function raw<T = unknown[]>(options?: { columnNames?: boolean }) {
      query.setReturnArrays(true);
      const rows = query.all(...args) as unknown as T[];
      return options?.columnNames
        ? [query.columns().map(({ name }) => name), ...rows]
        : rows;
    }

    const statement: D1PreparedStatement = {
      bind: (...values) => prepare(sql, values.map(binding)),
      async first<T>(column?: string): Promise<T | null> {
        query.setReturnArrays(false);
        if (
          column !== undefined &&
          !query.columns().some(({ name }) => name === column)
        ) {
          throw new Error(`Unknown SQLite D1 result column: ${column}`);
        }
        const row = query.get(...args);
        return row ? ((column === undefined ? row : row[column]) as T) : null;
      },
      async all<T>() {
        return execute<T>("all");
      },
      async run<T>() {
        return execute<T>("run");
      },
      raw,
    };
    executors.set(statement, () => execute("all"));
    return statement;
  }

  return {
    prepare,
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const work = statements.map((statement) => {
        const execute = executors.get(statement);
        if (!execute)
          throw new Error("SQLite D1 batch requires this adapter's statements");
        return execute;
      });
      // Synchronous execution keeps the transaction atomic even between callers.
      db.exec("BEGIN");
      try {
        const results = work.map((execute) => execute() as D1Result<T>);
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec() {
      throw new Error(
        "D1 exec is not implemented by the SQLite migration adapter",
      );
    },
    withSession() {
      throw new Error(
        "D1 sessions are not implemented by the SQLite migration adapter",
      );
    },
    async dump() {
      throw new Error(
        "D1 dump is not implemented by the SQLite migration adapter",
      );
    },
  };
}
