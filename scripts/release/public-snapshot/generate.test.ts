import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  ALLOWLIST_PATH,
  generatePublicSnapshot,
  isDenied,
} from "./generate.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "public-snapshot-test-"));
  dirs.push(dir);
  return dir;
}

const BASE_FILES: Record<string, string> = {
  "README.md": "# SDKs\n",
  "AGENTS.md": "internal\n",
  "MISSION.md": "internal\n",
  ".github/workflows/push.yml": "on: push\n",
  "packages/a/package.json": JSON.stringify({ name: "@morpho-org/a" }),
  "packages/a/src/index.ts": "export const a = 1;\n",
  "packages/a/AGENTS.md": "internal\n",
  "public/.github/workflows/ci.yml": "on: pull_request\n",
};

function commitRepo(
  files: Record<string, string>,
  include: readonly string[],
): { repo: string; sha: string } {
  const repo = tempDir();
  const run = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args])
      .toString()
      .trim();
  run("init", "-q");
  const all = { ...files, [ALLOWLIST_PATH]: JSON.stringify({ include }) };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  run("add", "-A");
  run(
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "release",
  );
  return { repo, sha: run("rev-parse", "HEAD") };
}

function commitStaged(repo: string): void {
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "change",
  ]);
}

const INCLUDE = ["README.md", "packages/*/package.json", "packages/*/src/**"];

describe("generatePublicSnapshot", () => {
  test("default", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);
    const outDir = tempDir();

    const manifest = generatePublicSnapshot({ repo, sha, outDir });

    expect(manifest.sourceCommit).toBe(sha);
    expect(manifest.files.map((file) => file.path)).toEqual([
      ".github/workflows/ci.yml",
      "README.md",
      "packages/a/package.json",
      "packages/a/src/index.ts",
    ]);
    expect(
      readFileSync(join(outDir, "tree/.github/workflows/ci.yml"), "utf8"),
    ).toBe("on: pull_request\n");
    expect(
      JSON.parse(readFileSync(join(outDir, "public-tree.json"), "utf8")),
    ).toEqual(manifest);
    const treeListing = execFileSync("git", [
      "-C",
      repo,
      "ls-tree",
      "-r",
      manifest.treeHash,
    ])
      .toString()
      .trim()
      .split("\n")
      .map((line) => {
        const [meta = "", path] = line.split("\t");
        return { path, mode: meta.split(" ")[0] };
      });
    expect(treeListing).toEqual(
      manifest.files.map(({ path, mode }) => ({ path, mode })),
    );
  });

  test("behavior: two runs on the same commit give the same tree hash", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);

    const first = generatePublicSnapshot({ repo, sha, outDir: tempDir() });
    const second = generatePublicSnapshot({ repo, sha, outDir: tempDir() });

    expect(second).toEqual(first);
    expect(first.treeHash).toMatch(/^[0-9a-f]{40}$/);
  });

  test("behavior: a new top-level file stays private", () => {
    const { repo, sha } = commitRepo(
      { ...BASE_FILES, "NEW.md": "draft\n", "new-dir/file.ts": "x\n" },
      INCLUDE,
    );

    const manifest = generatePublicSnapshot({ repo, sha, outDir: tempDir() });

    expect(manifest.files.map((file) => file.path)).not.toContain("NEW.md");
    expect(
      manifest.files.some((file) => file.path.startsWith("new-dir/")),
    ).toBe(false);
  });

  test("behavior: reads git objects, not the working tree", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);
    writeFileSync(join(repo, "README.md"), "uncommitted\n");
    writeFileSync(join(repo, ".env"), "SECRET=1\n");
    const outDir = tempDir();

    generatePublicSnapshot({ repo, sha, outDir });

    expect(readFileSync(join(outDir, "tree/README.md"), "utf8")).toBe(
      "# SDKs\n",
    );
  });

  test("behavior: normalises modes to 644 and 755", () => {
    const { repo } = commitRepo(BASE_FILES, INCLUDE);
    execFileSync("git", [
      "-C",
      repo,
      "update-index",
      "--chmod=+x",
      "README.md",
    ]);
    commitStaged(repo);
    const outDir = tempDir();

    generatePublicSnapshot({ repo, sha: "HEAD", outDir });

    expect(statSync(join(outDir, "tree/README.md")).mode & 0o777).toBe(0o755);
    expect(
      statSync(join(outDir, "tree/packages/a/src/index.ts")).mode & 0o777,
    ).toBe(0o644);
  });

  test("behavior: keeps symlinks whose target is public", () => {
    const { repo } = commitRepo(BASE_FILES, [...INCLUDE, "LINK.md"]);
    symlinkSync("README.md", join(repo, "LINK.md"));
    execFileSync("git", ["-C", repo, "add", "LINK.md"]);
    commitStaged(repo);
    const outDir = tempDir();

    generatePublicSnapshot({ repo, sha: "HEAD", outDir });

    expect(readlinkSync(join(outDir, "tree/LINK.md"))).toBe("README.md");
  });

  test("error: a hard-denied path in the allowlist fails the run", () => {
    const { repo, sha } = commitRepo(BASE_FILES, [
      ...INCLUDE,
      ".github/workflows/push.yml",
    ]);

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow(
      'Allowlist entry ".github/workflows/push.yml" matches no public file',
    );
  });

  test("error: an allowlist entry that matches nothing fails the run", () => {
    const { repo, sha } = commitRepo(BASE_FILES, [...INCLUDE, "missing.md"]);

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('Allowlist entry "missing.md" matches no public file');
  });

  test("error: a symlink to a private file fails the run", () => {
    const { repo } = commitRepo(BASE_FILES, [...INCLUDE, "LINK.md"]);
    symlinkSync("MISSION.md", join(repo, "LINK.md"));
    execFileSync("git", ["-C", repo, "add", "LINK.md"]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow('Symlink "LINK.md" points to "MISSION.md"');
  });

  test("error: a public/ file that collides with an allowlisted path fails the run", () => {
    const { repo, sha } = commitRepo(
      { ...BASE_FILES, "public/README.md": "public\n" },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"public/README.md" maps to "README.md"');
  });

  test("error: a public/ file that is the parent directory of an allowlisted path fails the run", () => {
    const { repo, sha } = commitRepo(
      { ...BASE_FILES, "public/packages/a/src": "x\n" },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow(
      '"packages/a/src" is a file in the public tree, but "packages/a/src/index.ts" needs it to be a directory',
    );
  });

  test("error: a path with a control character fails the run", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);
    const blob = execFileSync("git", [
      "-C",
      repo,
      "rev-parse",
      `${sha}:README.md`,
    ])
      .toString()
      .trim();
    execFileSync("git", [
      "-C",
      repo,
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${blob},packages/a/src/bad\nname.ts`,
    ]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow("has a control character");
  });

  test("behavior: a path starting with a double quote keeps its name in the tree hash", () => {
    const path = 'packages/a/src/"ab"';
    const { repo, sha } = commitRepo({ ...BASE_FILES, [path]: "x\n" }, INCLUDE);

    const manifest = generatePublicSnapshot({ repo, sha, outDir: tempDir() });

    const treePaths = execFileSync("git", [
      "-C",
      repo,
      "ls-tree",
      "-r",
      "-z",
      "--name-only",
      manifest.treeHash,
    ])
      .toString()
      .split("\0")
      .filter(Boolean);
    expect(treePaths).toEqual(manifest.files.map((file) => file.path));
    expect(treePaths).toContain(path);
  });

  test("error: a --sha starting with a dash fails the run", () => {
    const { repo } = commitRepo(BASE_FILES, INCLUDE);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "--all", outDir: tempDir() }),
    ).toThrow("Needed a single revision");
  });

  test.each([
    { name: "array", dependencies: ["@morpho-org/b"] },
    { name: "non-string range", dependencies: { "@morpho-org/b": 1 } },
  ])("error: a $name dependency field fails the run", ({ dependencies }) => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          dependencies,
        }),
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"packages/a/package.json" has a malformed "dependencies"');
  });

  test("behavior: public packages may depend on each other through workspace:", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          dependencies: { "@morpho-org/b": "workspace:^" },
        }),
        "packages/b/package.json": JSON.stringify({ name: "@morpho-org/b" }),
      },
      [...INCLUDE, "packages/b/package.json"],
    );

    const manifest = generatePublicSnapshot({ repo, sha, outDir: tempDir() });

    expect(manifest.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "packages/a/package.json",
        "packages/b/package.json",
      ]),
    );
  });

  test("error: a public package depending on a private workspace fails the run", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          devDependencies: { "@morpho-org/internal": "workspace:^" },
        }),
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"@morpho-org/a" depends on "@morpho-org/internal"');
  });

  test("error: an absolute symlink fails the run", () => {
    const { repo } = commitRepo(BASE_FILES, [...INCLUDE, "LINK.md"]);
    symlinkSync("/README.md", join(repo, "LINK.md"));
    execFileSync("git", ["-C", repo, "add", "LINK.md"]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow('Symlink "LINK.md" points to "/README.md"');
  });

  test("error: a symlink escaping the repository fails the run", () => {
    const { repo } = commitRepo(BASE_FILES, [...INCLUDE, "LINK.md"]);
    symlinkSync("../README.md", join(repo, "LINK.md"));
    execFileSync("git", ["-C", repo, "add", "LINK.md"]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow('Symlink "LINK.md" points to "../README.md"');
  });

  test("error: a submodule in the public tree fails the run", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);
    execFileSync("git", [
      "-C",
      repo,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${sha},packages/a/src/sub`,
    ]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow('"packages/a/src/sub" is a submodule');
  });

  test.each([
    "public/scripts/release/x.ts",
    "public/.agents/x.md",
    "public/.changeset/config.json",
    "public/.github/AGENTS.md",
    "public/.Claude/settings.json",
    "public/Scripts/CI/x.ts",
  ])("error: %s mapping to a hard-denied path fails the run", (path) => {
    const { repo, sha } = commitRepo({ ...BASE_FILES, [path]: "x\n" }, INCLUDE);

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow(`"${path}" maps to "${path.slice(7)}", which is hard-denied`);
  });

  test.each([
    { name: "missing", allowlist: { includes: ["README.md"] } },
    { name: "empty", allowlist: { include: [] } },
    { name: "non-string", allowlist: { include: [1] } },
  ])("error: a $name include list fails the run", ({ allowlist }) => {
    const { repo } = commitRepo(BASE_FILES, INCLUDE);
    writeFileSync(join(repo, ALLOWLIST_PATH), JSON.stringify(allowlist));
    execFileSync("git", ["-C", repo, "add", ALLOWLIST_PATH]);
    commitStaged(repo);

    expect(() =>
      generatePublicSnapshot({ repo, sha: "HEAD", outDir: tempDir() }),
    ).toThrow('must have a non-empty "include" array');
  });

  test("error: a package manifest without a name fails the run", () => {
    const { repo, sha } = commitRepo(
      { ...BASE_FILES, "packages/a/package.json": "{}" },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"packages/a/package.json" has no package name');
  });

  test("error: a public script importing a private file fails the run", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "scripts/lint/check.ts":
          'import { isMain } from "../ci/workflow.ts";\n',
        "scripts/ci/workflow.ts": "export const isMain = true;\n",
      },
      [...INCLUDE, "scripts/lint/check.ts"],
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"scripts/lint/check.ts" references "scripts/ci/workflow.ts"');
  });

  test("error: a public file dynamically importing a private file fails the run", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "scripts/lint/check.ts":
          'const { isMain } = await import("../ci/workflow.ts");\n',
        "scripts/ci/workflow.ts": "export const isMain = true;\n",
      },
      [...INCLUDE, "scripts/lint/check.ts"],
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"scripts/lint/check.ts" references "scripts/ci/workflow.ts"');
  });

  test("error: a public file importing a private directory fails the run", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "scripts/lint/check.ts": 'import { isMain } from "../ci";\n',
        "scripts/ci/index.ts": "export const isMain = true;\n",
      },
      [...INCLUDE, "scripts/lint/check.ts"],
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"scripts/lint/check.ts" references "scripts/ci"');
  });

  test.each([
    { name: "array", scripts: ["node x.ts"] },
    { name: "non-string command", scripts: { build: 1 } },
  ])("error: $name package scripts fail the run", ({ scripts }) => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          scripts,
        }),
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('"packages/a/package.json" has a malformed "scripts"');
  });

  test("behavior: a package script running its own build output passes", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          scripts: { start: "node lib/esm/cli.js" },
        }),
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).not.toThrow();
  });

  test("behavior: a value export of a relative-looking string is not a reference", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/src/index.ts": 'export const OUT_DIR = "./dist";\n',
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).not.toThrow();
  });

  test("error: a public package script running a private file fails the run", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/package.json": JSON.stringify({
          name: "@morpho-org/a",
          scripts: { build: "node ../../scripts/release/version.ts && tsc" },
        }),
        "scripts/release/version.ts": "export {};\n",
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).toThrow('references "scripts/release/version.ts"');
  });

  test("behavior: resolves .js specifiers and multi-line imports, ignores string fixtures", () => {
    const { repo, sha } = commitRepo(
      {
        ...BASE_FILES,
        "packages/a/src/index.ts":
          'export * from "./b.js";\nimport "./c.ts";\nimport {\n  c,\n} from "./c.ts";\nconst fixture = \'export * from "./missing.js";\';\n',
        "packages/a/src/c.ts": "export const c = 1;\n",
        "packages/a/src/b.ts": "export const b = 1;\n",
      },
      INCLUDE,
    );

    expect(() =>
      generatePublicSnapshot({ repo, sha, outDir: tempDir() }),
    ).not.toThrow();
  });

  test("error: refuses a non-empty output directory", () => {
    const { repo, sha } = commitRepo(BASE_FILES, INCLUDE);
    const outDir = tempDir();
    writeFileSync(join(outDir, "stale"), "x");

    expect(() => generatePublicSnapshot({ repo, sha, outDir })).toThrow(
      "is not empty",
    );
  });
});

describe("isDenied", () => {
  test.each([
    ".github/CODEOWNERS",
    ".agents/x.md",
    ".claude/settings.json",
    ".codex/config.toml",
    ".review/x.md",
    "docs/templates/ADR.md",
    ".changeset/config.json",
    "scripts/release/helpers.ts",
    "scripts/ci/workflow.ts",
    "docs/retros/TEMPLATE.md",
    ".Agents/x.md",
    "Scripts/Release/helpers.ts",
    "packages/a/src/CLAUDE.md",
    "AGENTS.md",
    "agents.md",
    "packages/a/src/Claude.md",
    ".env",
    ".ENV",
    "packages/a/.Env.local",
    "packages/a/.env.local",
  ])("behavior: denies %s", (path) => {
    expect(isDenied(path)).toBe(true);
  });

  test.each([
    ".env.example",
    "public/.github/workflows/ci.yml",
    "scripts/lint/x.ts",
  ])("behavior: allows %s", (path) => {
    expect(isDenied(path)).toBe(false);
  });
});
