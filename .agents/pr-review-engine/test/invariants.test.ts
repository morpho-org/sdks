#!/usr/bin/env node
// Invariant test for the .agents/pr-review-engine/ PR review engine.
//
// Asserts structural integrity that the rest of the engine relies on:
//
//   1. Every agent file has parseable frontmatter with the required fields.
//   2. Every conditional agent's `trigger:` references a flag computed
//      in SKILL.md Step 4.
//   3. The engine itself (.agents/pr-review-engine/SKILL.md) has the
//      `disable-model-invocation: true` flag.
//   4. Both bundled scripts (build-changed-lines.ts, validate-findings.ts)
//      exist and parse-execute under native Node.
//   5. AGENTS.md §10 persona-inventory tables name every agent file under
//      .agents/pr-review-engine/agents/ and no others.
//
// Run: pnpm test:agents
// Exit code: 0 on green, 1 on any violation. Violations print to stderr.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const AGENTS_DIR = join(REPO_ROOT, ".agents/pr-review-engine/agents");
const SCRIPTS_DIR = join(REPO_ROOT, ".agents/pr-review-engine/scripts");
const SKILL_PATH = join(REPO_ROOT, ".agents/pr-review-engine/SKILL.md");
const AGENTS_MD_PATH = join(REPO_ROOT, "AGENTS.md");

const REQUIRED_PERSONA_FIELDS = ["name", "kind", "version", "applies"] as const;
const ALLOWED_KINDS = ["baseline", "conditional"] as const;
const SCRIPT_FILES = [
  "build-changed-lines.ts",
  "validate-findings.ts",
] as const;

interface Frontmatter {
  readonly [key: string]: string;
}

function parseFrontmatter(content: string): Frontmatter | null {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const body = m[1]!;
  const result: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const kv = line.match(/^([a-z][a-zA-Z0-9_-]*):\s*(.+)$/);
    if (!kv) continue;
    result[kv[1]!] = kv[2]!.trim();
  }
  return result;
}

const failures: string[] = [];

function fail(check: string, detail: string): void {
  failures.push(`✗ ${check}: ${detail}`);
}

function ok(check: string): void {
  process.stdout.write(`✓ ${check}\n`);
}

// 1. Every persona has frontmatter with required fields.
const personaFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
const conditionalTriggers = new Map<string, string>();

for (const file of personaFiles) {
  const fmContent = readFileSync(join(AGENTS_DIR, file), "utf8");
  const fm = parseFrontmatter(fmContent);
  if (!fm) {
    fail("persona-frontmatter", `${file}: no parseable frontmatter`);
    continue;
  }
  for (const field of REQUIRED_PERSONA_FIELDS) {
    if (!fm[field])
      fail("persona-frontmatter", `${file}: missing required field "${field}"`);
  }
  if (fm.kind && !(ALLOWED_KINDS as readonly string[]).includes(fm.kind)) {
    fail(
      "persona-frontmatter",
      `${file}: kind="${fm.kind}" not in ${ALLOWED_KINDS.join("|")}`,
    );
  }
  if (fm.version && !/^\d+\.\d+\.\d+$/.test(fm.version)) {
    fail("persona-frontmatter", `${file}: version="${fm.version}" not semver`);
  }
  if (fm.kind === "conditional") {
    if (!fm.trigger) {
      fail(
        "persona-frontmatter",
        `${file}: conditional persona missing "trigger" field`,
      );
    } else {
      conditionalTriggers.set(fm.name ?? file, fm.trigger);
    }
  }
}
if (failures.length === 0)
  ok(`persona frontmatter (${personaFiles.length} files)`);

// 2. Every conditional `trigger:` flag is computed in SKILL.md Step 4.
const baseContent = readFileSync(SKILL_PATH, "utf8");
const triggerBlock = baseContent.match(
  /### Detect conditional persona triggers([\s\S]*?)(?=^###|^##)/m,
);
const triggerSection = triggerBlock?.[1] ?? "";
for (const [persona, trigger] of conditionalTriggers) {
  const flagName = trigger.replace(/[<>]/g, "");
  if (!triggerSection.includes(flagName)) {
    fail(
      "persona-trigger-wiring",
      `${persona}: trigger flag "${flagName}" is not defined in SKILL.md Step 4`,
    );
  }
}
if (conditionalTriggers.size > 0 && failures.length === 0) {
  ok(`conditional triggers wired (${conditionalTriggers.size} flags)`);
}

// 3. Engine has disable-model-invocation: true.
const baseFm = parseFrontmatter(baseContent);
if (!baseFm) {
  fail("engine-frontmatter", "SKILL.md: no parseable frontmatter");
} else {
  if (baseFm["disable-model-invocation"] !== "true") {
    fail(
      "engine-frontmatter",
      `SKILL.md: disable-model-invocation must be "true", got "${baseFm["disable-model-invocation"] ?? "<missing>"}"`,
    );
  }
  if (baseFm.kind !== "engine") {
    fail(
      "engine-frontmatter",
      `SKILL.md: kind must be "engine", got "${baseFm.kind ?? "<missing>"}"`,
    );
  }
  if (!baseFm.version || !/^\d+\.\d+\.\d+$/.test(baseFm.version)) {
    fail(
      "engine-frontmatter",
      `SKILL.md: version="${baseFm.version ?? "<missing>"}" not semver`,
    );
  }
  if (failures.length === 0) ok("engine frontmatter (SKILL.md)");
}

// 4. Both bundled scripts exist and parse-execute under native Node.
for (const script of SCRIPT_FILES) {
  const scriptPath = join(SCRIPTS_DIR, script);
  if (!existsSync(scriptPath)) {
    fail("bundled-scripts", `${script}: file missing at ${scriptPath}`);
    continue;
  }
  try {
    // Spawn `node --check` to confirm the file parses.
    execFileSync("node", ["--check", scriptPath], { stdio: "pipe" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(
      "bundled-scripts",
      `${script}: node --check failed: ${msg.slice(0, 200)}`,
    );
  }
}
if (failures.length === 0)
  ok(`bundled scripts parse (${SCRIPT_FILES.length} files)`);

// 5. AGENTS.md §10 inventory tables name every persona file (and no others).
const agentsMd = readFileSync(AGENTS_MD_PATH, "utf8");
const personaSlugsInTables = new Set<string>();
const PERSONA_LINK_RE =
  /\[`([a-z0-9-]+)`\]\(\.\/\.agents\/pr-review-engine\/agents\/([a-z0-9-]+)\.md\)/g;
for (const match of agentsMd.matchAll(PERSONA_LINK_RE)) {
  // match[1] is the displayed name; match[2] is the filename slug
  personaSlugsInTables.add(match[2]!);
}

const personaSlugsOnDisk = new Set(
  personaFiles.map((f) => f.replace(/\.md$/, "")),
);
const onDiskNotInTables: string[] = [];
const inTablesNotOnDisk: string[] = [];
for (const slug of personaSlugsOnDisk) {
  if (!personaSlugsInTables.has(slug)) onDiskNotInTables.push(slug);
}
for (const slug of personaSlugsInTables) {
  if (!personaSlugsOnDisk.has(slug)) inTablesNotOnDisk.push(slug);
}
if (onDiskNotInTables.length > 0) {
  fail(
    "agents-md-inventory",
    `personas on disk but missing from AGENTS.md tables: ${onDiskNotInTables.join(", ")}`,
  );
}
if (inTablesNotOnDisk.length > 0) {
  fail(
    "agents-md-inventory",
    `personas in AGENTS.md tables but missing on disk: ${inTablesNotOnDisk.join(", ")}`,
  );
}
if (onDiskNotInTables.length === 0 && inTablesNotOnDisk.length === 0) {
  ok(
    `AGENTS.md §10 ↔ on-disk personas match (${personaSlugsOnDisk.size} files)`,
  );
}

// Final report.
if (failures.length > 0) {
  process.stderr.write(`\nFAIL: ${failures.length} invariant violation(s):\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}

process.stdout.write(`\nAll PR review engine invariants OK.\n`);
