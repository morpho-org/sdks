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
      "chmod",
    ]);
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
      "link",
    ]);
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
      "link",
    ]);

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
    ".changeset/config.json",
    "scripts/release/helpers.ts",
    "scripts/ci/workflow.ts",
    "docs/retros/TEMPLATE.md",
    "packages/a/src/CLAUDE.md",
    "AGENTS.md",
    ".env",
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
