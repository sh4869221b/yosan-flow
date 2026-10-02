import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
  type DrizzleSQLiteSnapshotJSON,
} from "drizzle-kit/api";
import config from "../../drizzle.config";
import * as model from "../../src/lib/server/db/schema";

export async function currentSnapshot() {
  return generateSQLiteDrizzleJson(model, undefined, config.casing);
}

function schemaContent(snapshot: DrizzleSQLiteSnapshotJSON) {
  // UUIDs and rename-resolution maps describe generation history, not schema.
  // Serialization omits undefined fields exactly as Drizzle's disk writer does.
  const { id: _id, prevId: _prevId, _meta: _renames, ...content } = snapshot;
  return JSON.parse(JSON.stringify(content));
}

export function verifyGeneratedSnapshot(
  saved: DrizzleSQLiteSnapshotJSON,
  current: DrizzleSQLiteSnapshotJSON,
) {
  assert.deepEqual(
    schemaContent(current),
    schemaContent(saved),
    "schema.ts differs from the latest snapshot: run pnpm db:generate and review SQL/metadata",
  );
}

function tokens(sql: string): string[] {
  return (
    sql.match(
      /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[\w]+|[^\s]/g,
    ) ?? []
  )
    .filter((token) => !token.startsWith("--") && !token.startsWith("/*"))
    .map((token) => {
      if (token.startsWith("'")) return token;
      return token.replace(/^["`\[]|["`\]]$/g, "").toLowerCase();
    });
}

function parenthesized(input: string[], start: number) {
  let depth = 1;
  let end = start;
  for (; end < input.length && depth > 0; end++) {
    if (input[end] === "(") depth++;
    if (input[end] === ")") depth--;
  }
  assert.equal(depth, 0, "Unterminated SQL expression");
  return { expression: input.slice(start, end - 1), end };
}

function checkExpressions(sql: string, table: string) {
  const input = tokens(sql);
  const checks: string[] = [];
  for (let index = 0; index < input.length; index++) {
    if (input[index] !== "check" || input[index + 1] !== "(") continue;
    const { expression, end } = parenthesized(input, index + 2);
    checks.push(
      expression
        .filter(
          (token, offset) =>
            !(token === table && expression[offset + 1] === ".") &&
            !(token === "." && expression[offset - 1] === table),
        )
        .join(" "),
    );
    index = end - 1;
  }
  return checks.sort();
}

function columnSemantics(sql: string) {
  const input = tokens(sql);
  assert(
    !input.includes("deferrable"),
    "Add explicit schema inspection for deferred FK declarations before introducing them",
  );
  assert(
    !input.some((token, i) => token === "on" && input[i + 1] === "conflict"),
    "Add explicit schema inspection for ON CONFLICT clauses before introducing them",
  );
  const definitions: string[][] = [];
  let definition: string[] = [];
  let depth = 1;
  for (const token of input.slice(input.indexOf("(") + 1)) {
    if (token === "(") depth++;
    if (token === ")") depth--;
    if (depth === 0 || (depth === 1 && token === ",")) {
      definitions.push(definition);
      definition = [];
      if (depth === 0) break;
    } else {
      definition.push(token);
    }
  }
  return new Map(
    definitions.map((parts) => {
      const collate = parts.indexOf("collate");
      const generated = parts.indexOf("as");
      return [
        parts[0],
        {
          collation: collate < 0 ? "binary" : parts[collate + 1],
          autoincrement: parts.includes("autoincrement"),
          generated: generated < 0 ? [] : parts.slice(generated + 1),
        },
      ];
    }),
  );
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const ordered = <T>(values: T[]) =>
  values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function inspectSchema(db: DatabaseSync) {
  const objects = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name != 'd1_migrations' ORDER BY name",
    )
    .all();
  return objects
    .filter(({ type }) => type !== "index")
    .map(({ type, name, sql }) => {
      const table = String(name);
      if (type !== "table") return { type, name, sql: tokens(String(sql)) };
      const semantics = columnSemantics(String(sql));
      const columns = db
        .prepare(`PRAGMA table_xinfo(${quote(table)})`)
        .all()
        .map(({ cid: _cid, ...column }) => {
          // Exactly the two documented TEXT PK differences in the adoption baseline.
          // Data-preservation tests separately reject enforcing NOT NULL on legacy IDs.
          const legacyTextPk =
            ["budget_periods", "daily_operation_histories"].includes(table) &&
            column.name === "id" &&
            column.pk === 1 &&
            String(column.type).toUpperCase() === "TEXT";
          return {
            ...column,
            type: String(column.type).toUpperCase(),
            semantics: semantics.get(String(column.name).toLowerCase()),
            notnull: legacyTextPk ? 0 : column.notnull,
          };
        });
      const foreignKeyRows = db
        .prepare(`PRAGMA foreign_key_list(${quote(table)})`)
        .all();
      const foreignKeys = [...new Set(foreignKeyRows.map(({ id }) => id))].map(
        (groupId) =>
          foreignKeyRows
            .filter(({ id }) => id === groupId)
            .sort((a, b) => Number(a.seq) - Number(b.seq))
            .map(({ id: _id, ...key }) => key),
      );
      const indexes = db
        .prepare(`PRAGMA index_list(${quote(table)})`)
        .all()
        .map(({ name: index, unique, origin, partial }) => ({
          name: origin === "c" ? index : origin,
          unique,
          partial,
          columns: db
            .prepare(`PRAGMA index_xinfo(${quote(String(index))})`)
            .all()
            .map(({ cid: _cid, ...column }) => column),
          sql:
            origin === "c"
              ? tokens(
                  String(
                    objects.find(({ name: objectName }) => objectName === index)
                      ?.sql,
                  ),
                )
              : undefined,
        }));
      const options = db
        .prepare("SELECT wr, strict FROM pragma_table_list WHERE name = ?")
        .get(table);
      return {
        type,
        name,
        columns: ordered(columns),
        foreignKeys: ordered(foreignKeys),
        indexes: ordered(indexes),
        checks: checkExpressions(String(sql), table),
        options,
      };
    });
}

export async function canonicalSchema(snapshot: DrizzleSQLiteSnapshotJSON) {
  const db = new DatabaseSync(":memory:");
  try {
    const empty = await generateSQLiteDrizzleJson({});
    const statements = await generateSQLiteMigration(empty, snapshot);
    for (const statement of statements) db.exec(statement);
    return inspectSchema(db);
  } finally {
    db.close();
  }
}
