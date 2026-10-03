import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
import { isMain } from "../ci/workflow.ts";

const ID_PATTERN = /INV-\d{2}/;

/**
 * Returns the invariant IDs declared in the SECURITY.md "Security invariants" table: every row after
 * the `| ID |` header and its separator, until the first non-table line. Each row must start with
 * an `INV-NN` cell.
 */
export const parseDocumentedIds = (markdown: string): string[] => {
  const lines = markdown.split("\n");
  const header = lines.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
  if (header === -1) return [];
  const rows: string[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    rows.push((line.split("|")[1] ?? "").trim());
  }
  const malformed = rows.filter(
    (cell) => !new RegExp(`^${ID_PATTERN.source}$`).test(cell),
  );
  if (malformed.length > 0)
    throw new Error(
      `Malformed invariant IDs in SECURITY.md (expected INV-NN): ${malformed.map((cell) => `"${cell}"`).join(", ")}`,
    );
  const duplicates = rows.filter((id, index) => rows.indexOf(id) !== index);
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate invariant IDs in SECURITY.md: ${duplicates.join(", ")}`,
    );
  return rows;
};

const TEST_FUNCTIONS = new Set(["describe", "test", "it"]);
/** Modifiers that skip a block, or may skip it depending on a runtime condition. */
const SKIPPING_MODIFIERS = new Set([
  "skip",
  "todo",
  "fails",
  "skipIf",
  "runIf",
]);
const TAG_PATTERN = new RegExp(`^\\[(${ID_PATTERN.source})\\]`);

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" &&
  value != null &&
  typeof (value as { type?: unknown }).type === "string";

/** Returns the function and modifiers of a Vitest call such as `test.skipIf(x)(…)`, or `undefined`. */
const testCallee = (
  callee: AstNode,
): { readonly name: string; readonly modifiers: string[] } | undefined => {
  if (callee.type === "Identifier")
    return TEST_FUNCTIONS.has(callee.name as string)
      ? { name: callee.name as string, modifiers: [] }
      : undefined;
  if (callee.type === "CallExpression")
    return testCallee(callee.callee as AstNode);
  if (callee.type === "MemberExpression" && isNode(callee.property)) {
    const inner = testCallee(callee.object as AstNode);
    return (
      inner && {
        ...inner,
        modifiers: [...inner.modifiers, callee.property.name as string],
      }
    );
  }
  return undefined;
};

const titleOf = (node: unknown): string | undefined => {
  if (!isNode(node)) return undefined;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral")
    return (node.quasis as { value: { cooked: string } }[])[0]?.value.cooked;
  return undefined;
};

const isFunction = (node: unknown): boolean =>
  isNode(node) &&
  (node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression");

/** Whether a Vitest options object such as `{ skip: true }` may skip the block. */
const skipsByOptions = (node: unknown): boolean =>
  isNode(node) &&
  node.type === "ObjectExpression" &&
  (node.properties as AstNode[]).some(
    (property) =>
      property.type === "Property" &&
      isNode(property.key) &&
      SKIPPING_MODIFIERS.has(
        (property.key.name ?? property.key.value) as string,
      ) &&
      !(
        isNode(property.value) &&
        property.value.type === "Literal" &&
        property.value.value === false
      ),
  );

/**
 * Returns the invariant IDs that open a `describe`/`test`/`it` title as `[INV-NN]`, parsing the
 * file as TypeScript. A tag counts as active only if its block always runs: tags on, or nested
 * inside, skip/todo/fails/skipIf/runIf blocks or blocks with a `{ skip/todo/fails }` options
 * object, tests with no function, and tagged suites with no runnable test, are
 * returned separately so they do not count as coverage.
 */
export const parseTaggedIds = (
  source: string,
  file = "test.ts",
): { readonly active: string[]; readonly skipped: string[] } => {
  const { program, errors } = parseSync(file, source, { lang: "ts" });
  if (errors.length > 0)
    throw new Error(`Cannot parse ${file}: ${errors[0]?.message}`);
  const active = new Set<string>();
  const skipped = new Set<string>();
  /** Visits `value` and returns whether it contains a test that runs. */
  const visit = (value: unknown, inSkipped: boolean): boolean => {
    if (Array.isArray(value))
      return value.reduce<boolean>(
        (found, item) => visit(item, inSkipped) || found,
        false,
      );
    if (!isNode(value)) return false;
    const call =
      value.type === "CallExpression"
        ? testCallee(value.callee as AstNode)
        : undefined;
    const args = (value.arguments ?? []) as unknown[];
    const isSkipped =
      inSkipped ||
      (call != null &&
        (call.modifiers.some((modifier) => SKIPPING_MODIFIERS.has(modifier)) ||
          skipsByOptions(args[1])));
    let runs = false;
    for (const [key, child] of Object.entries(value))
      if (key !== "type") runs = visit(child, isSkipped) || runs;
    if (call == null) return runs;
    const runsHere =
      !isSkipped &&
      (call.name === "describe" ? runs : args.slice(1).some(isFunction));
    const id = titleOf(args[0])?.match(TAG_PATTERN)?.[1];
    if (id != null) (runsHere ? active : skipped).add(id);
    return runsHere || runs;
  };
  visit(program, false);
  return { active: [...active], skipped: [...skipped] };
};

/** Compares documented and tagged IDs; returns one message per mismatch. */
export const checkInvariants = ({
  documented,
  tagged,
  skipped = new Map(),
}: {
  readonly documented: readonly string[];
  readonly tagged: ReadonlyMap<string, readonly string[]>;
  readonly skipped?: ReadonlyMap<string, readonly string[]>;
}): string[] => {
  const errors: string[] = [];
  for (const [id, files] of skipped)
    errors.push(
      `[${id}] is tagged in ${files.join(", ")} on blocks that may not run (skip, todo, fails, skipIf, runIf, skip/todo/fails options, a test without a function, or a suite with no runnable test); such blocks do not count as coverage.`,
    );
  if (documented.length === 0)
    errors.push(
      "SECURITY.md declares no invariant IDs (expected rows like `| INV-01 | … |`).",
    );
  for (const id of documented)
    if (!tagged.has(id))
      errors.push(
        `${id} is documented in SECURITY.md but no test is tagged [${id}].`,
      );
  for (const [id, files] of tagged)
    if (!documented.includes(id))
      errors.push(
        `[${id}] is tagged in ${files.join(", ")} but is not documented in SECURITY.md.`,
      );
  return errors;
};

const collectTestFiles = (dir: string, files: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "lib" ||
      entry.name === "dist"
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(path, files);
    else if (entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
};

const main = (): void => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const documented = parseDocumentedIds(
    readFileSync(join(root, "SECURITY.md"), "utf-8"),
  );
  const tagged = new Map<string, string[]>();
  const skipped = new Map<string, string[]>();
  for (const file of collectTestFiles(join(root, "packages"))) {
    const ids = parseTaggedIds(
      readFileSync(file, "utf-8"),
      relative(root, file),
    );
    for (const [found, into] of [
      [ids.active, tagged],
      [ids.skipped, skipped],
    ] as const)
      for (const id of found)
        into.set(id, [...(into.get(id) ?? []), relative(root, file)]);
  }

  const errors = checkInvariants({ documented, tagged, skipped });
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log(
    `All ${documented.length} SECURITY.md invariants have tagged tests.`,
  );
};

if (isMain(import.meta.url)) main();
