#!/usr/bin/env node
// JSDoc coverage burndown for Tier 1–4 packages.
// Approximate, regex-driven. Phase 0 informational; CI gating lands in Phase 5
// per docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md.
//
// Flags:
//   --verbose       — list every undocumented export under each package.
//   --json          — emit a machine-readable JSON array (one entry per package)
//                     instead of the Markdown table. Pairs with --verbose to
//                     include the per-package undocumented list. Designed for
//                     the future Phase 5 CI gate.
//   --self-check    — run a fixed set of EXPORT_RE / hasParams / isFunctionLike
//                     test cases, print pass/fail, exit 1 on any failure. Cheap
//                     guard against TypeScript syntax drift breaking the regex
//                     silently.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");

const TIER = {
  "morpho-sdk": 1,
  "evm-simulation": 1,
  "blue-sdk": 2,
  "simulation-sdk": 2,
  "blue-sdk-viem": 2,
  "bundler-sdk-viem": 3,
  "liquidation-sdk-viem": 3,
  "liquidity-sdk-viem": 3,
  "migration-sdk-viem": 3,
  "blue-sdk-wagmi": 4,
  "simulation-sdk-wagmi": 4,
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

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    process.stderr.write(`jsdoc-coverage: skipped ${dir}: ${err.message}\n`);
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
function isInternal(jsdocBlock) {
  return /@internal\b/.test(jsdocBlock);
}

function hasParams(signature) {
  // Arrow function: `= (...)`, `= async (...)`, or `= <T>(...)` (generic arrow).
  // Known limitation: nested generic constraints like `<T extends Foo<Bar>>`
  // break the `[^>]+` consume — no occurrences in Tier 1 today.
  const arrow = signature.match(/=\s*(?:async\s+)?(?:<[^>]+>\s*)?\(([^)]*)\)/);
  if (arrow) return arrow[1].trim().length > 0;
  // Function declaration: `function name(...)` or `function name<T>(...)`.
  const fn = signature.match(/function\s+\w+\s*(?:<[^>]+>\s*)?\(([^)]*)\)/);
  if (fn) return fn[1].trim().length > 0;
  return false;
}

function isFunctionLike(kind, signature) {
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

function analyzeFile(filePath, { collectUndocumented }) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");
  const undocumented = [];
  let total = 0;
  let documented = 0;

  const recordMissing = (entry) => {
    if (collectUndocumented) undocumented.push(entry);
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(EXPORT_RE);
    if (!m) continue;
    const [, kind, name] = m;
    total++;

    // Find closing `*/` immediately above (allow blank lines and single-line `//` directives
    // such as `// biome-ignore` or `// eslint-disable`).
    let j = i - 1;
    while (j >= 0) {
      const t = lines[j].trim();
      if (t === "" || t.startsWith("//")) {
        j--;
        continue;
      }
      break;
    }
    if (j < 0 || !lines[j].includes("*/")) {
      recordMissing({ name, kind, reason: "no JSDoc" });
      continue;
    }

    // Walk back to opening `/**`.
    let k = j;
    while (k >= 0 && !lines[k].trimStart().startsWith("/**")) k--;
    if (k < 0) {
      recordMissing({ name, kind, reason: "malformed JSDoc" });
      continue;
    }
    const block = lines.slice(k, j + 1).join("\n");

    // @internal exempts the symbol from coverage entirely (matches typedoc's
    // excludeInternal behavior — these are not on the public docs surface).
    if (isInternal(block)) {
      total--;
      continue;
    }

    // Description = at least one non-tag prose line.
    if (!/\n\s*\*\s+[^@\s*]/.test(block) && !/\/\*\*\s+[^@\s*]/.test(block)) {
      recordMissing({ name, kind, reason: "no description" });
      continue;
    }

    // Classes, interfaces, types, enums, namespaces: description suffices per §6.
    if (
      kind === "class" ||
      kind === "interface" ||
      kind === "type" ||
      kind === "enum" ||
      kind === "namespace"
    ) {
      documented++;
      continue;
    }

    const signature = lines.slice(i, Math.min(i + 8, lines.length)).join(" ");
    if (!isFunctionLike(kind, signature)) {
      // Plain constant — description suffices.
      documented++;
      continue;
    }

    const missing = [];
    if (hasParams(signature) && !block.includes("@param"))
      missing.push("@param");
    if (!block.includes("@returns")) missing.push("@returns");
    if (!block.includes("@example")) missing.push("@example");

    if (missing.length === 0) {
      documented++;
    } else {
      recordMissing({
        name,
        kind,
        reason: `missing ${missing.join(", ")}`,
      });
    }
  }

  return { total, documented, undocumented };
}

function pct(part, total) {
  if (total === 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function selfCheck() {
  let pass = 0;
  let fail = 0;
  const fails = [];

  // EXPORT_RE — match + kind + name capture for representative export forms,
  // plus negative cases that must not match.
  const exportCases = [
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
    if (ok && expectMatch) ok = m[1] === c.kind && m[2] === c.name;
    if (ok) pass++;
    else {
      fail++;
      fails.push(
        `EXPORT_RE FAIL: ${JSON.stringify(c.line)} → expected ${expectMatch ? `kind=${c.kind} name=${c.name}` : "no match"}, got ${matched ? `kind=${m[1]} name=${m[2]}` : "no match"}`,
      );
    }
  }

  // hasParams — verifies @param requirement detection across signature shapes.
  const hasParamsCases = [
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
  const isFunctionLikeCases = [
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
  const internalCases = [
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

  for (const f of fails) process.stderr.write(`${f}\n`);
  process.stderr.write(`self-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

const verbose = process.argv.includes("--verbose");
const json = process.argv.includes("--json");

if (process.argv.includes("--self-check")) selfCheck();

const rows = [];

for (const pkg of Object.keys(TIER)) {
  const srcDir = join(PACKAGES_DIR, pkg, "src");
  let total = 0;
  let documented = 0;
  const undocumented = [];
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
  rows.push({ tier: TIER[pkg], pkg, total, documented, undocumented });
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
    "Generated by `pnpm jsdoc:coverage`. Tier 1–4 packages only; test helpers and generated code excluded.",
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
