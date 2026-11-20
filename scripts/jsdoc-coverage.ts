#!/usr/bin/env node
// JSDoc coverage burndown for Tier 1–4 packages.
// Approximate and regex-driven.
//
// Flags:
//   --verbose       — list every undocumented export under each package.
//   --json          — emit a machine-readable JSON array (one entry per package)
//                     instead of the Markdown table. Pairs with --verbose to
//                     include the per-package undocumented list. Designed for
//                     the future Phase 5 CI gate.
//   --self-check    — run export analysis and syntax helper
//                     test cases, print pass/fail, exit 1 on any failure. Cheap
//                     guard against TypeScript syntax drift breaking the regex
//                     silently.

import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

const TIER: Record<string, number> = {
  "morpho-sdk": 1,
  "evm-simulation": 1,
  "blue-sdk": 2,
  "blue-sdk-viem": 2,
  "morpho-ts": 4,
};

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "lib",
  "dist",
  "test",
  "__tests__",
  "test-helpers",
]);
const EXCLUDED_FILE_PATTERNS = [/\.test\.ts$/, /\.spec\.ts$/, /\.d\.ts$/];
const EXCLUDED_PATH_PATTERNS = [
  /\/internal\//,
  /\/api\/(sdk|types)\.ts$/,
  /\/generated\//,
];

function* walk(dir: string): Generator<string> {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`jsdoc-coverage: skipped ${dir}: ${message}\n`);
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (!full.endsWith(".ts")) continue;
    if (EXCLUDED_FILE_PATTERNS.some((p) => p.test(entry.name))) continue;
    if (EXCLUDED_PATH_PATTERNS.some((p) => p.test(full))) continue;
    yield full;
  }
}

// Matches `export <kind> Name` allowing any combination of leading
// (async|abstract|default|declare) modifiers in any order. Optional leading
// whitespace lets the regex pick up indented exports — namespace members like
// `  export function toPeriod(...)` inside `export namespace Time { ... }`.
//
// Disambiguation is delegated to the TypeScript compiler — the regex never
// sees code that doesn't compile, so `export async abstract function foo` and
// similar nonsensical combinations cannot reach here in practice. The
// modifiers are also valid identifiers (`export type async = ...`); the regex
// is anchored on the `kind` token so name capture is unambiguous in those
// cases (kind=type, name=async).
//
// Re-export forms (`export { foo } from`, `export * from`, `export type { Foo }`)
// are intentionally NOT matched — they aren't local exports.
const EXPORT_RE =
  /^\s*export\s+(?:(?:async|abstract|default|declare)\s+)*(const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

// Matches `@internal` as a real JSDoc tag, not as text inside an `@example`
// code block. Known limitation: a literal `@internal` mention in a code-fence
// (e.g. `// @internal`) inside `@example` will still match — no occurrences in
// the repo today; tighten if a real false positive surfaces.
function isInternal(jsdocBlock: string): boolean {
  return /@internal\b/.test(jsdocBlock);
}

function hasParams(signature: string): boolean {
  // Arrow function: `= (...)`, `= async (...)`, or `= <T>(...)` (generic arrow).
  // Known limitation: nested generic constraints like `<T extends Foo<Bar>>`
  // break the `[^>]+` consume — no occurrences in Tier 1 today.
  const arrow = signature.match(/=\s*(?:async\s+)?(?:<[^>]+>\s*)?\(([^)]*)\)/);
  if (arrow) return (arrow[1] ?? "").trim().length > 0;
  // Function declaration: `function name(...)` or `function name<T>(...)`.
  const fn = signature.match(/function\s+\w+\s*(?:<[^>]+>\s*)?\(([^)]*)\)/);
  if (fn) return (fn[1] ?? "").trim().length > 0;
  return false;
}

function isFunctionLike(kind: string, signature: string): boolean {
  if (kind === "function") return true;
  if (kind !== "const" && kind !== "let" && kind !== "var") return false;
  // const X = (...) => ... | const X = async (...) => ...
  // const X = <T>(...) => ... (generic arrow — symmetric with hasParams)
  // const X = function ...
  return (
    /=\s*(?:async\s+)?(?:<[^>]+>\s*)?\(/.test(signature) ||
    /=\s*(?:async\s+)?function\b/.test(signature)
  );
}

interface UndocumentedEntry {
  kind: string;
  name: string;
  reason: string;
}

interface FileAnalysis {
  documented: number;
  total: number;
  undocumented: UndocumentedEntry[];
}

function findJSDoc(lines: string[], index: number): string | undefined {
  let end = index - 1;
  while (end >= 0) {
    const line = (lines[end] ?? "").trim();
    if (line !== "" && !line.startsWith("//")) break;
    end--;
  }
  if (end < 0 || !(lines[end] ?? "").includes("*/")) return undefined;

  let start = end;
  while (start >= 0 && !(lines[start] ?? "").trimStart().startsWith("/**"))
    start--;
  return start < 0 ? "" : lines.slice(start, end + 1).join("\n");
}

interface ExportEntry {
  index: number;
  kind: string;
  name: string;
  indent: string;
}

function groupExports(lines: string[]): ExportEntry[][] {
  const groups: ExportEntry[][] = [];
  let previous: ExportEntry | undefined;
  for (const [index, line] of lines.entries()) {
    const match = line.match(EXPORT_RE);
    if (!match) continue;
    const [, kind = "", name = ""] = match;
    const entry = { index, kind, name, indent: line.match(/^\s*/)?.[0] ?? "" };
    const group = groups.at(-1);
    if (
      group &&
      kind === "function" &&
      previous?.kind === kind &&
      previous.name === name &&
      previous.indent === entry.indent
    )
      group.push(entry);
    else groups.push([entry]);
    previous = entry;
  }
  return groups;
}

function analyzeFile(
  filePath: string,
  { collectUndocumented }: { collectUndocumented: boolean },
): FileAnalysis {
  const text = readFileSync(filePath, "utf-8");
  return analyzeSource(text, { collectUndocumented });
}

function analyzeSource(
  text: string,
  { collectUndocumented }: { collectUndocumented: boolean },
): FileAnalysis {
  const lines = text.split("\n");
  const undocumented: UndocumentedEntry[] = [];
  let total = 0;
  let documented = 0;

  const recordMissing = (entry: UndocumentedEntry) => {
    if (collectUndocumented) undocumented.push(entry);
  };

  for (const group of groupExports(lines)) {
    const members = group.map((entry) => ({
      ...entry,
      block: findJSDoc(lines, entry.index),
    }));
    const member =
      members.find((entry) => entry.block !== undefined) ?? members[0];
    if (!member) continue;
    const { kind, name, block } = member;
    total++;
    if (block === undefined) {
      recordMissing({ name, kind, reason: "no JSDoc" });
      continue;
    }

    // @internal exempts the symbol from coverage entirely (matches typedoc's
    // excludeInternal behavior — these are not on the public docs surface).
    if (isInternal(block)) {
      total--;
      continue;
    }

    let reason: string | undefined;
    for (const entry of members) {
      if (entry.block === undefined || isInternal(entry.block)) continue;
      const signature = lines.slice(entry.index, entry.index + 8).join(" ");
      reason = documentationIssue({
        kind: entry.kind,
        signature,
        block: entry.block,
      });
      if (reason) break;
    }
    if (reason) recordMissing({ name, kind, reason });
    else documented++;
  }

  return { total, documented, undocumented };
}

function documentationIssue({
  kind,
  signature,
  block,
}: {
  kind: string;
  signature: string;
  block: string;
}): string | undefined {
  if (block === "") return "malformed JSDoc";
  if (!/\n\s*\*\s+[^@\s*]/.test(block) && !/\/\*\*\s+[^@\s*]/.test(block))
    return "no description";
  if (!isFunctionLike(kind, signature)) return undefined;
  const missing: string[] = [];
  if (hasParams(signature) && !block.includes("@param")) missing.push("@param");
  if (!block.includes("@returns")) missing.push("@returns");
  if (!block.includes("@example")) missing.push("@example");
  return missing.length > 0 ? `missing ${missing.join(", ")}` : undefined;
}

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function selfCheck(): never {
  let pass = 0;
  let fail = 0;
  const fails: string[] = [];

  // EXPORT_RE — match + kind + name capture for representative export forms,
  // plus negative cases that must not match.
  const exportCases: {
    expectMatch?: boolean;
    kind?: string;
    line: string;
    name?: string;
  }[] = [
    {
      line: "export const foo = (x: number) => x;",
      kind: "const",
      name: "foo",
    },
    {
      line: "export function foo(x: number) { return x; }",
      kind: "function",
      name: "foo",
    },
    { line: "export async function foo() {}", kind: "function", name: "foo" },
    { line: "export class Foo {}", kind: "class", name: "Foo" },
    {
      line: "export interface Foo { a: number; }",
      kind: "interface",
      name: "Foo",
    },
    { line: "export type Foo = string;", kind: "type", name: "Foo" },
    { line: "export enum Foo { A, B }", kind: "enum", name: "Foo" },
    { line: "export namespace Foo {}", kind: "namespace", name: "Foo" },
    { line: "export const FOO = 100n;", kind: "const", name: "FOO" },
    { line: "export type async = string;", kind: "type", name: "async" },
    { line: "export default function foo() {}", kind: "function", name: "foo" },
    { line: "export abstract class Foo {}", kind: "class", name: "Foo" },
    { line: "export declare const foo: number;", kind: "const", name: "foo" },
    { line: "// not an export", expectMatch: false },
    { line: "import { foo } from 'bar';", expectMatch: false },
    // Indented exports must match — namespace members are pervasive in
    // morpho-ts (e.g. `export function toPeriod` inside `namespace Time`).
    {
      line: "  export const indented = 1;",
      kind: "const",
      name: "indented",
    },
    {
      line: "  export function toPeriod() {}",
      kind: "function",
      name: "toPeriod",
    },
    // Re-export forms must NOT match — they aren't local exports.
    { line: "export { foo } from './bar.js';", expectMatch: false },
    { line: "export * from './bar.js';", expectMatch: false },
    { line: "export type { Foo } from './bar.js';", expectMatch: false },
  ];

  for (const c of exportCases) {
    const m = c.line.match(EXPORT_RE);
    const matched = !!m;
    const expectMatch = c.expectMatch ?? true;
    let ok = matched === expectMatch;
    if (ok && expectMatch) ok = m?.[1] === c.kind && m?.[2] === c.name;
    if (ok) pass++;
    else {
      fail++;
      fails.push(
        `EXPORT_RE FAIL: ${JSON.stringify(c.line)} → expected ${expectMatch ? `kind=${c.kind} name=${c.name}` : "no match"}, got ${matched ? `kind=${m?.[1]} name=${m?.[2]}` : "no match"}`,
      );
    }
  }

  // hasParams — verifies @param requirement detection across signature shapes.
  const hasParamsCases: { expected: boolean; sig: string }[] = [
    { sig: "export const foo = (x: number) => x;", expected: true },
    { sig: "export const foo = () => x;", expected: false },
    { sig: "export const foo = async (x: number) => x;", expected: true },
    { sig: "export const foo = <T>(x: T) => x;", expected: true }, // generic arrow
    { sig: "export const foo = <T,>(x: T) => x;", expected: true },
    { sig: "export function foo(x: number) {}", expected: true },
    { sig: "export function foo() {}", expected: false },
    { sig: "export function foo<T>(x: T) {}", expected: true },
    { sig: "export const FOO = 100n;", expected: false }, // not a function
  ];
  for (const c of hasParamsCases) {
    const got = hasParams(c.sig);
    if (got === c.expected) pass++;
    else {
      fail++;
      fails.push(
        `hasParams FAIL: ${JSON.stringify(c.sig)} → expected ${c.expected}, got ${got}`,
      );
    }
  }

  // isFunctionLike — verifies function vs constant classification.
  // Generic arrows are now recognized symmetrically with hasParams.
  const isFunctionLikeCases: {
    expected: boolean;
    kind: string;
    sig: string;
  }[] = [
    { kind: "function", sig: "export function foo() {}", expected: true },
    { kind: "const", sig: "export const foo = (x) => x;", expected: true },
    {
      kind: "const",
      sig: "export const foo = async () => {};",
      expected: true,
    },
    {
      kind: "const",
      sig: "export const foo = <T>(x: T) => x;",
      expected: true,
    },
    {
      kind: "const",
      sig: "export const foo = function () {};",
      expected: true,
    },
    { kind: "const", sig: "export const FOO = 100n;", expected: false },
    { kind: "type", sig: "export type Foo = string;", expected: false },
    { kind: "class", sig: "export class Foo {}", expected: false },
  ];
  for (const c of isFunctionLikeCases) {
    const got = isFunctionLike(c.kind, c.sig);
    if (got === c.expected) pass++;
    else {
      fail++;
      fails.push(
        `isFunctionLike FAIL: kind=${c.kind} ${JSON.stringify(c.sig)} → expected ${c.expected}, got ${got}`,
      );
    }
  }

  // @internal exemption — exercises the production isInternal() helper so any
  // future tweak to the @internal recognition rule is caught at self-check time.
  const internalCases: { block: string; expected: boolean }[] = [
    { block: "/**\n * Foo.\n * @internal\n */", expected: true },
    { block: "/** @internal */", expected: true },
    { block: "/**\n * Foo.\n */", expected: false },
    {
      block: "/**\n * Foo.\n * @example\n * `// @internal`\n */",
      // Documented limitation: the simple regex DOES match `@internal` inside
      // a code-fence. No occurrences in the repo today; tighten if a real
      // false positive surfaces.
      expected: true,
    },
  ];
  for (const c of internalCases) {
    const got = isInternal(c.block);
    if (got === c.expected) pass++;
    else {
      fail++;
      fails.push(
        `isInternal FAIL: ${JSON.stringify(c.block)} → expected ${c.expected}, got ${got}`,
      );
    }
  }

  const documentedFunction = `/**
 * Returns the input.
 * @param value - The input.
 * @returns The input.
 * @example identity(1)
 */`;
  const overloads = `export function identity(value: string): string;
export function identity(value: number): number;
export function identity(value: string | number) { return value; }`;
  const analysisCases = [
    {
      name: "documented overload group",
      source: `${documentedFunction}\n${overloads}`,
      total: 1,
      documented: 1,
      missing: 0,
    },
    {
      name: "undocumented overload group",
      source: overloads,
      total: 1,
      documented: 0,
      missing: 1,
    },
    {
      name: "plain documented function",
      source: `${documentedFunction}\nexport function identity(value: number) { return value; }`,
      total: 1,
      documented: 1,
      missing: 0,
    },
    { name: "empty source", source: "", total: 0, documented: 0, missing: 0 },
    {
      name: "second overload missing example",
      source: `${documentedFunction}\nexport function identity(value: string): string;\n${documentedFunction.replace(" * @example identity(1)\n", "")}\nexport function identity(value: number): number;\nexport function identity(value: string | number) { return value; }`,
      total: 1,
      documented: 0,
      missing: 1,
    },
    {
      name: "both overloads documented",
      source: `${documentedFunction}\nexport function identity(value: string): string;\n${documentedFunction}\nexport function identity(value: number): number;\nexport function identity(value: string | number) { return value; }`,
      total: 1,
      documented: 1,
      missing: 0,
    },
    {
      name: "documentation on implementation",
      source: `export function identity(value: string): string;\n${documentedFunction}\nexport function identity(value: string) { return value; }`,
      total: 1,
      documented: 1,
      missing: 0,
    },
    {
      name: "incomplete overload documentation",
      source: `/** Returns the input. */\n${overloads}`,
      total: 1,
      documented: 0,
      missing: 1,
    },
    {
      name: "internal overload group",
      source: `/** @internal */\n${overloads}`,
      total: 0,
      documented: 0,
      missing: 0,
    },
    {
      name: "internal later overload",
      source: `${documentedFunction}\nexport function identity(value: string): string;\n/** @internal */\nexport function identity(value: number): number;\nexport function identity(value: string | number) { return value; }`,
      total: 1,
      documented: 1,
      missing: 0,
    },
    {
      name: "same name in separate namespaces",
      source: `export namespace A {\n${overloads}\n}\nexport namespace B {\n${overloads}\n}`,
      total: 4,
      documented: 0,
      missing: 4,
    },
  ];
  for (const c of analysisCases) {
    const got = analyzeSource(c.source, { collectUndocumented: true });
    if (
      got.total === c.total &&
      got.documented === c.documented &&
      got.undocumented.length === c.missing
    )
      pass++;
    else {
      fail++;
      fails.push(
        `analyzeSource FAIL: ${c.name} → expected total=${c.total} documented=${c.documented} undocumented=${c.missing}, got total=${got.total} documented=${got.documented} undocumented=${got.undocumented.length}`,
      );
    }
  }

  for (const f of fails) process.stderr.write(`${f}\n`);
  process.stderr.write(`self-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

const verbose = process.argv.includes("--verbose");
const json = process.argv.includes("--json");

if (process.argv.includes("--self-check")) selfCheck();

interface CoverageRow {
  documented: number;
  pkg: string;
  tier: number;
  total: number;
  undocumented: (UndocumentedEntry & { file: string })[];
}

const rows: CoverageRow[] = [];

for (const [pkg, tier] of Object.entries(TIER)) {
  const srcDir = join(PACKAGES_DIR, pkg, "src");
  let total = 0;
  let documented = 0;
  const undocumented: (UndocumentedEntry & { file: string })[] = [];
  for (const file of walk(srcDir)) {
    const r = analyzeFile(file, { collectUndocumented: verbose });
    total += r.total;
    documented += r.documented;
    if (r.undocumented.length > 0) {
      const rel = relative(REPO_ROOT, file);
      for (const u of r.undocumented) {
        undocumented.push({ file: rel, ...u });
      }
    }
  }
  rows.push({ tier, pkg, total, documented, undocumented });
}

rows.sort((a, b) => a.tier - b.tier || a.pkg.localeCompare(b.pkg));

if (json) {
  // Machine-readable shape for the future Phase 5 gate. Each row is
  // `{ tier, pkg, total, documented, undocumented }`. `undocumented` is empty
  // unless `--verbose` is also passed.
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  console.log("# JSDoc coverage burndown");
  console.log("");
  console.log(
    "Generated by `bun run jsdoc:coverage`. Tier 1–4 packages only; test helpers and generated code excluded.",
  );
  console.log("");
  console.log("| Tier | Package | Documented | Total | Coverage |");
  console.log("| ---- | ------- | ---------- | ----- | -------- |");
  let totalDocumented = 0;
  let totalCount = 0;
  for (const r of rows) {
    console.log(
      `| ${r.tier} | \`${r.pkg}\` | ${r.documented} | ${r.total} | ${pct(r.documented, r.total)} |`,
    );
    totalDocumented += r.documented;
    totalCount += r.total;
  }
  console.log(
    `| — | **Total** | **${totalDocumented}** | **${totalCount}** | **${pct(totalDocumented, totalCount)}** |`,
  );

  if (verbose) {
    console.log("");
    console.log("## Undocumented exports");
    console.log("");
    for (const r of rows) {
      if (r.undocumented.length === 0) continue;
      console.log(`### ${r.pkg}`);
      console.log("");
      for (const u of r.undocumented) {
        console.log(`- \`${u.name}\` (${u.kind}, ${u.reason}) — ${u.file}`);
      }
      console.log("");
    }
  }
}
