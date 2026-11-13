import { resolve } from "node:path";
import { parse } from "svelte/compiler";
import ts from "typescript";

const writerRoot = "src/lib/server/db/";
const rawCapabilities: Readonly<Record<string, readonly string[]>> = {
  [`${writerRoot}day-entry-write-sql.ts`]: ["prepare", "bind"],
  [`${writerRoot}day-entry-replay-sql.ts`]: ["prepare", "bind"],
  [`${writerRoot}day-entry-writer.ts`]: ["batch"],
};
const statementTypeFiles = new Set([
  `${writerRoot}d1-types.ts`,
  ...Object.keys(rawCapabilities),
]);
const rawEntrypoints = new Set([
  "prepare",
  "batch",
  "exec",
  "dump",
  "withSession",
]);
const runtimeDdl =
  /\b(?:CREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|TRIGGER)|ALTER\s+TABLE|DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER)|PRAGMA)\b/i;

function embeddedExpression(record: Record<string, unknown>): unknown {
  return (
    record.expression ??
    record.declaration ??
    (record.type === "AssignmentPattern" ? record : undefined)
  );
}

// Parse, rather than compile, Svelte so dead-code elimination cannot hide a
// forbidden access. Both script contexts and template expressions are checked.
function svelteSource(source: string): string {
  const ast = parse(source, { modern: true });
  function scriptSource(content: object) {
    const { start, end } = content as { start: number; end: number };
    return source.slice(start, end);
  }
  const parts = [ast.module, ast.instance].flatMap((script) =>
    script ? [scriptSource(script.content)] : [],
  );
  function expressions(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(expressions);
      return;
    }
    const record = node as Record<string, unknown>;
    const expression = embeddedExpression(record);
    if (expression && typeof expression === "object") {
      const { start, end, type } = expression as {
        start: number;
        end: number;
        type: string;
      };
      const text = source.slice(start, end);
      parts.push(type.endsWith("Declaration") ? `${text};` : `(${text});`);
      return;
    }
    Object.values(record).forEach(expressions);
  }
  expressions(ast.fragment);
  return parts.join("\n");
}

function memberName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return node.argumentExpression.text;
  if (ts.isBindingElement(node) && !node.dotDotDotToken) {
    const name = node.propertyName ?? node.name;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  }
  return undefined;
}

function memberReceiver(node: ts.Node): ts.Expression | undefined {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return node.expression;
  if (ts.isBindingElement(node) && ts.isVariableDeclaration(node.parent.parent))
    return node.parent.parent.initializer;
  return undefined;
}

function memberOwners(node: ts.Node, name: string, checker: ts.TypeChecker) {
  const expression = memberReceiver(node);
  const symbol = expression
    ? checker.getTypeAtLocation(expression).getProperty(name)
    : checker.getSymbolAtLocation(node);
  return (symbol?.declarations ?? []).map((declaration) => ({
    file: declaration.getSourceFile().fileName.replaceAll("\\", "/"),
    name:
      ts.isClassDeclaration(declaration.parent) ||
      ts.isInterfaceDeclaration(declaration.parent)
        ? declaration.parent.name?.text
        : undefined,
  }));
}

function memberViolation(
  node: ts.Node,
  checker: ts.TypeChecker,
  path: string,
): string | undefined {
  const name = memberName(node);
  if (!name) return;
  const owners = memberOwners(node, name, checker);
  const isDrizzle = owners.some(({ file }) => file.includes("/drizzle-orm/"));
  if (isDrizzle)
    return name === "raw" ? "unreviewed Drizzle sql.raw" : undefined;
  if (name === "exec" && owners.some(({ name }) => name === "RegExp")) return;
  if (rawCapabilities[path]?.includes(name)) return;
  const isD1 = owners.some(({ name }) =>
    /^D1(?:Database|PreparedStatement|DatabaseSession)$/.test(name ?? ""),
  );
  if (isD1 || rawEntrypoints.has(name))
    return `raw D1 ${name} outside its reviewed capability`;
}

function identifierViolation(node: ts.Node, path: string): string | undefined {
  if (!ts.isIdentifier(node)) return;
  if (node.text === "D1PreparedStatement" && !statementTypeFiles.has(path))
    return "D1PreparedStatement outside writer/type boundary";
  if (["prepareUpsertDailyTotal", "prepareInsertHistory"].includes(node.text))
    return "removed prepared-statement API";
}

function literalViolations(node: ts.Node): string[] {
  if (!ts.isStringLiteralLike(node) && !ts.isTemplateLiteralToken(node))
    return [];
  const messages: string[] = [];
  if (runtimeDdl.test(node.text)) messages.push("runtime DDL or PRAGMA");
  if (/^drizzle-orm\/.*\bmigrator$/.test(node.text))
    messages.push("runtime Drizzle migrator");
  return messages;
}

/** Review guard, not a sandbox: dynamic computed API names still need review. */
export function auditDatabaseSource(
  files: ReadonlyMap<string, string>,
): string[] {
  const virtual = new Map(
    [...files].map(([path, source]) => [
      resolve(path.endsWith(".svelte") ? `${path}.__sql_guard.ts` : path),
      {
        path,
        source: path.endsWith(".svelte") ? svelteSource(source) : source,
      },
    ]),
  );
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  host.readFile = (path) => virtual.get(resolve(path))?.source ?? read(path);
  host.fileExists = (path) => virtual.has(resolve(path)) || exists(path);
  const program = ts.createProgram(
    [...virtual.keys(), resolve("worker-runtime.d.ts")],
    options,
    host,
  );
  const checker = program.getTypeChecker();
  const violations: string[] = [];
  for (const [filename, { path }] of virtual) {
    const source = program.getSourceFile(filename);
    if (!source) throw new Error(`Missing source for database guard: ${path}`);
    const report = (reason: string) => violations.push(`${path}: ${reason}`);
    function visit(node: ts.Node) {
      const memberError = memberViolation(node, checker, path);
      if (memberError) report(memberError);
      const identifierError = identifierViolation(node, path);
      if (identifierError) report(identifierError);
      literalViolations(node).forEach(report);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...new Set(violations)];
}
