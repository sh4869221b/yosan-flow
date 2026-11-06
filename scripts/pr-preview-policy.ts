import assert from "node:assert/strict";

export type Database = { uuid: string; name: string };
export const workerName = "yosan-flow-pr";
export function names(number: number) {
  assert(Number.isSafeInteger(number) && number > 0, "Invalid PR number");
  return { preview: `pr-${number}`, database: `yosan-flow-pr-${number}` };
}

export function selectDatabase(
  number: number,
  databases: Database[],
  protectedIds: string[],
) {
  const matches = databases.filter((db) => db.name === names(number).database);
  assert(matches.length <= 1, "Ambiguous database name");
  const db = matches[0];
  if (db) {
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        db.uuid,
      ),
      "Invalid database UUID",
    );
    assert(!protectedIds.includes(db.uuid), "Protected database UUID");
    assert(
      databases.filter((other) => other.uuid === db.uuid).length === 1,
      "Shared database UUID",
    );
  }
  return db;
}

export function configs(
  number: number,
  database: Database,
  parent: Record<string, unknown>,
) {
  assert(
    parent.name === workerName &&
      parent.workers_dev === false &&
      parent.preview_urls === true,
  );
  // Construct from an allowlist: no top-level binding, vars, secret, route or environment inheritance.
  const binding = {
    binding: "DB",
    database_name: names(number).database,
    database_id: database.uuid,
    migrations_dir: "migrations",
    migrations_pattern: "migrations/*.sql",
  };
  assert(database.name === binding.database_name);
  const common = {
    name: workerName,
    compatibility_date: parent.compatibility_date,
    compatibility_flags: ["nodejs_compat"],
    workers_dev: false,
    preview_urls: true,
  };
  return {
    preview: {
      ...common,
      main: ".svelte-kit/cloudflare/_worker.js",
      assets: { binding: "ASSETS", directory: ".svelte-kit/cloudflare" },
      previews: {
        observability: (parent.previews as Record<string, unknown>)
          .observability,
        d1_databases: [binding],
      },
    },
    migration: { ...common, d1_databases: [binding] },
  };
}

export function previewUrl(number: number, value: string) {
  const url = new URL(value);
  assert(
    url.protocol === "https:" && !url.username && !url.password && !url.port,
  );
  assert(
    new RegExp(
      `^${names(number).preview}-${workerName}\\.[a-z0-9-]+\\.workers\\.dev$`,
    ).test(url.hostname),
    "Unexpected Preview URL",
  );
  assert(url.pathname === "/" && !url.search && !url.hash);
  return url.origin;
}
