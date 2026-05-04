#!/usr/bin/env node
// JSDoc coverage burndown for Tier 1–4 packages.
// Approximate, regex-driven. Phase 0 informational; CI gating lands in Phase 5
// per docs/tibs/TIB-2026-05-04-jsdoc-coverage-on-exported-symbols.md.

import { readdirSync, readFileSync, statSync } from "node:fs";
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
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (!full.endsWith(".ts")) continue;
    if (EXCLUDED_FILE_PATTERNS.some((p) => p.test(name))) continue;
    if (EXCLUDED_PATH_PATTERNS.some((p) => p.test(full))) continue;
    yield full;
  }
}

const EXPORT_RE =
  /^export\s+(?:async\s+|abstract\s+|default\s+|declare\s+)?(const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;

function hasParams(signature) {
  // Arrow function: `= (...)` or `= async (...)`.
  const arrow = signature.match(/=\s*(?:async\s+)?\(([^)]*)\)/);
  if (arrow) return arrow[1].trim().length > 0;
  // Function declaration: `function name(...)`.
  const fn = signature.match(/function\s+\w+\s*\(([^)]*)\)/);
  if (fn) return fn[1].trim().length > 0;
  return false;
}

function isFunctionLike(kind, signature) {
  if (kind === "function") return true;
  if (kind !== "const" && kind !== "let" && kind !== "var") return false;
  // const X = (...) => ... | const X = async (...) => ... | const X = function ...
  return (
    /=\s*(?:async\s+)?\(/.test(signature) ||
    /=\s*(?:async\s+)?function\b/.test(signature)
  );
}

function analyzeFile(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const lines = text.split("\n");
  const undocumented = [];
  let total = 0;
  let documented = 0;

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
      undocumented.push({ name, kind, reason: "no JSDoc" });
      continue;
    }

    // Walk back to opening `/**`.
    let k = j;
    while (k >= 0 && !lines[k].trimStart().startsWith("/**")) k--;
    if (k < 0) {
      undocumented.push({ name, kind, reason: "malformed JSDoc" });
      continue;
    }
    const block = lines.slice(k, j + 1).join("\n");

    // Description = at least one non-tag prose line.
    if (!/\n\s*\*\s+[^@\s*]/.test(block) && !/\/\*\*\s+[^@\s*]/.test(block)) {
      undocumented.push({ name, kind, reason: "no description" });
      continue;
    }

    // Classes, interfaces, types, enums: description suffices per §6.
    if (
      kind === "class" ||
      kind === "interface" ||
      kind === "type" ||
      kind === "enum"
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
      undocumented.push({
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

const verbose = process.argv.includes("--verbose");
const rows = [];

for (const pkg of Object.keys(TIER)) {
  const srcDir = join(PACKAGES_DIR, pkg, "src");
  let total = 0;
  let documented = 0;
  const undocumented = [];
  for (const file of walk(srcDir)) {
    const r = analyzeFile(file);
    total += r.total;
    documented += r.documented;
    if (verbose && r.undocumented.length > 0) {
      const rel = relative(REPO_ROOT, file);
      for (const u of r.undocumented) {
        undocumented.push({ file: rel, ...u });
      }
    }
  }
  rows.push({ tier: TIER[pkg], pkg, total, documented, undocumented });
}

rows.sort((a, b) => a.tier - b.tier || a.pkg.localeCompare(b.pkg));

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
