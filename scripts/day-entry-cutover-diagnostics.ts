import { readdirSync, readFileSync } from "node:fs";

const migrations = new URL("../migrations/", import.meta.url);
const file = readdirSync(migrations).find((name) =>
  name.endsWith("_verify_history_and_fence_writers.sql"),
);
if (!file) throw new Error("Missing day entry cutover migration");
const source = readFileSync(new URL(file, migrations), "utf8");
const plan =
  /-- BEGIN LEGACY ORDER PLAN\n([\s\S]+?)\n-- END LEGACY ORDER PLAN/.exec(
    source,
  )?.[1];
if (!plan) throw new Error("Missing legacy order plan in migration");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--legacy-schema")) {
  throw new Error(
    "Usage: node scripts/day-entry-cutover-diagnostics.ts [--legacy-schema]",
  );
}
const query = args.length
  ? plan
      .replace(
        "after_total_yen, write_order,",
        "after_total_yen, 0 AS write_order,",
      )
      .replace("WHERE EXISTS (SELECT 1 FROM day_entry_receipts)", "WHERE 0")
  : plan;
process.stdout.write(
  `SELECT budget_period_id, date, issue FROM (\n${query}\n) WHERE issue IS NOT NULL ORDER BY budget_period_id, date;\n`,
);
