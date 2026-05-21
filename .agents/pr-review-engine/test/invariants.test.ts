// Invariant tests for the .agents/pr-review-engine/ PR review engine.
//
// Asserts structural integrity that the rest of the engine relies on. These
// are not unit tests for any single source file (those are colocated next to
// the .ts they cover); they're cross-cutting invariants over the engine's
// on-disk layout and the AGENTS.md ↔ persona-file backlinks.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const AGENTS_DIR = join(REPO_ROOT, ".agents/pr-review-engine/agents");
const SCRIPTS_DIR = join(REPO_ROOT, ".agents/pr-review-engine/scripts");
const SKILL_PATH = join(REPO_ROOT, ".agents/pr-review-engine/SKILL.md");
const AGENTS_MD_PATH = join(REPO_ROOT, "AGENTS.md");

const REQUIRED_PERSONA_FIELDS = ["name", "kind", "version", "applies"] as const;
const ALLOWED_KINDS = ["baseline", "conditional"] as const;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

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

const personaFiles = readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

const personaFrontmatter = new Map<string, Frontmatter>();
for (const file of personaFiles) {
  const fm = parseFrontmatter(readFileSync(join(AGENTS_DIR, file), "utf8"));
  if (fm) personaFrontmatter.set(file, fm);
}

const skillContent = readFileSync(SKILL_PATH, "utf8");
const skillFrontmatter = parseFrontmatter(skillContent);
const agentsMdContent = readFileSync(AGENTS_MD_PATH, "utf8");

describe("persona frontmatter", () => {
  test("default: every persona file has parseable YAML frontmatter", () => {
    for (const file of personaFiles) {
      expect(personaFrontmatter.has(file), `${file}: missing frontmatter`).toBe(
        true,
      );
    }
  });

  test.each(personaFiles)("%s has all required fields", (file) => {
    const fm = personaFrontmatter.get(file)!;
    for (const field of REQUIRED_PERSONA_FIELDS) {
      expect(fm[field], `${file} is missing "${field}"`).toBeTruthy();
    }
  });

  test.each(personaFiles)("%s has a valid kind", (file) => {
    const fm = personaFrontmatter.get(file)!;
    expect(ALLOWED_KINDS as readonly string[]).toContain(fm.kind);
  });

  test.each(personaFiles)("%s has a semver version", (file) => {
    const fm = personaFrontmatter.get(file)!;
    expect(fm.version).toMatch(SEMVER_RE);
  });

  test.each(
    personaFiles,
  )("%s declares a trigger iff kind=conditional", (file) => {
    const fm = personaFrontmatter.get(file)!;
    if (fm.kind === "conditional") {
      expect(
        fm.trigger,
        `${file}: kind=conditional must declare "trigger"`,
      ).toBeTruthy();
    }
  });
});

describe("conditional triggers wired into SKILL.md Step 4", () => {
  const triggerBlockMatch = skillContent.match(
    /### Detect conditional persona triggers([\s\S]*?)(?=^###|^##)/m,
  );
  const triggerBlock = triggerBlockMatch?.[1] ?? "";

  const conditionalPersonas = personaFiles
    .map((f) => [f, personaFrontmatter.get(f)!] as const)
    .filter(([, fm]) => fm.kind === "conditional");

  test.each(
    conditionalPersonas,
  )("%s trigger flag is computed in SKILL.md Step 4", (_file, fm) => {
    const flag = fm.trigger!.replace(/[<>]/g, "");
    expect(
      triggerBlock,
      `trigger "${flag}" must be defined in SKILL.md Step 4 — agents that fire on a missing flag never run`,
    ).toContain(flag);
  });
});

describe("engine frontmatter (SKILL.md)", () => {
  test("default: parseable", () => {
    expect(skillFrontmatter).not.toBeNull();
  });

  test("behavior: kind is 'engine'", () => {
    expect(skillFrontmatter?.kind).toBe("engine");
  });

  test("behavior: disable-model-invocation is 'true'", () => {
    expect(skillFrontmatter?.["disable-model-invocation"]).toBe("true");
  });

  test("behavior: version is semver", () => {
    expect(skillFrontmatter?.version).toMatch(SEMVER_RE);
  });
});

describe("bundled scripts import cleanly", () => {
  test("build-changed-lines exports buildChangedLines + DiffParseError", async () => {
    const mod = await import(join(SCRIPTS_DIR, "build-changed-lines.ts"));
    expect(typeof mod.buildChangedLines).toBe("function");
    expect(typeof mod.DiffParseError).toBe("function");
  });

  test("validate-findings exports validateFindings + helpers + error class", async () => {
    const mod = await import(join(SCRIPTS_DIR, "validate-findings.ts"));
    expect(typeof mod.validateFindings).toBe("function");
    expect(typeof mod.findFencedBlocks).toBe("function");
    expect(typeof mod.FindingsParseError).toBe("function");
  });
});

describe("AGENTS.md §10 ↔ on-disk personas", () => {
  const PERSONA_LINK_RE =
    /\[`([a-z0-9-]+)`\]\(\.\/\.agents\/pr-review-engine\/agents\/([a-z0-9-]+)\.md\)/g;
  const personasInAgentsMd = new Set<string>();
  for (const match of agentsMdContent.matchAll(PERSONA_LINK_RE)) {
    personasInAgentsMd.add(match[2]!);
  }
  const personasOnDisk = new Set(
    personaFiles.map((f) => f.replace(/\.md$/, "")),
  );

  test("every on-disk persona is referenced in AGENTS.md §10", () => {
    const missing = [...personasOnDisk].filter(
      (p) => !personasInAgentsMd.has(p),
    );
    expect(missing).toEqual([]);
  });

  test("every persona referenced in AGENTS.md §10 exists on disk", () => {
    const orphaned = [...personasInAgentsMd].filter(
      (p) => !personasOnDisk.has(p),
    );
    expect(orphaned).toEqual([]);
  });
});
