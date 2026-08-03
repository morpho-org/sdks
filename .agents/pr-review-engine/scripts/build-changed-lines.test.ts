import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeChangedLines, parseDiff } from "./build-changed-lines.ts";

describe("parseDiff", () => {
  it("maps an addition hunk to its new-file line numbers", () => {
    const diff =
      "diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n@@ -2,0 +3,2 @@\n+NEW1\n+NEW2\n";
    expect(parseDiff(diff)).toEqual({ "foo.txt": [3, 4] });
  });

  it("treats an omitted count as one line", () => {
    const diff =
      "diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n@@ -2 +2 @@\n-old\n+MODIFIED\n";
    expect(parseDiff(diff)).toEqual({ "foo.txt": [2] });
  });

  it("anchors a deletion-only hunk and clamps below 1", () => {
    expect(parseDiff("+++ b/foo.txt\n@@ -2,3 +1,0 @@\n")).toEqual({
      "foo.txt": [1],
    });
    expect(parseDiff("+++ b/foo.txt\n@@ -1,2 +0,0 @@\n")).toEqual({
      "foo.txt": [1],
    });
  });

  it("skips /dev/null (deletion) and records a key for a header with no hunks", () => {
    expect(parseDiff("+++ /dev/null\n@@ -1,2 +0,0 @@\n")).toEqual({});
    expect(parseDiff("+++ b/empty.txt\n")).toEqual({ "empty.txt": [] });
  });
});

describe("mergeChangedLines", () => {
  it("unions committed and uncommitted maps per path, sorted", () => {
    expect(
      mergeChangedLines({
        committed: { "a.txt": [3, 1] },
        uncommitted: { "a.txt": [2], "b.txt": [5] },
        renamed: [],
      }),
    ).toEqual({ "a.txt": [1, 2, 3], "b.txt": [5] });
  });

  it("adds renamed paths as empty-array keys", () => {
    expect(
      mergeChangedLines({
        committed: {},
        uncommitted: {},
        renamed: ["renamed.txt"],
      }),
    ).toEqual({
      "renamed.txt": [],
    });
  });

  it("does not overwrite an existing key's lines with a rename entry", () => {
    expect(
      mergeChangedLines({
        committed: { "r.txt": [10] },
        uncommitted: {},
        renamed: ["r.txt"],
      }),
    ).toEqual({ "r.txt": [10] });
  });
});

describe("build-changed-lines CLI (real git)", () => {
  const SCRIPT = join(import.meta.dirname, "build-changed-lines.ts");

  function makeGit(dir: string) {
    return (args: readonly string[]): string =>
      execFileSync("git", [...args], { cwd: dir, encoding: "utf8" });
  }

  function initRepo() {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "bcl-")));
    const git = makeGit(dir);
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test User"]);
    git(["config", "commit.gpgsign", "false"]);
    return { dir, git };
  }

  function build(
    dir: string,
    args: readonly string[],
  ): Record<string, number[]> {
    const res = spawnSync("node", [SCRIPT, ...args], {
      cwd: dir,
      encoding: "utf8",
    });
    if (res.status !== 0)
      throw new Error(
        `build-changed-lines exited ${res.status}: ${res.stderr}`,
      );
    return JSON.parse(res.stdout);
  }

  it("maps a simple addition hunk to the expected line numbers", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "foo.txt"), "a\nb\nc\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "foo.txt"), "a\nb\nNEW1\nNEW2\nc\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "add two lines"]);

    expect(build(dir, ["--base", base, "--head", "HEAD"])["foo.txt"]).toEqual([
      3, 4,
    ]);
  });

  it("anchors a deletion-only hunk at line 1", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "foo.txt"), "a\nb\nc\nd\ne\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "foo.txt"), "a\ne\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "delete middle"]);

    expect(build(dir, ["--base", base, "--head", "HEAD"])["foo.txt"]).toEqual([
      1,
    ]);
  });

  it("parses a single-line modify (omitted count) as one line", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "foo.txt"), "a\nb\nc\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "foo.txt"), "a\nMODIFIED\nc\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "single-line modify"]);

    expect(build(dir, ["--base", base, "--head", "HEAD"])["foo.txt"]).toEqual([
      2,
    ]);
  });

  it("emits a pure rename as a key with an empty array", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "foo.txt"), "unchanged content here\n");
    git(["add", "foo.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    git(["mv", "foo.txt", "bar.txt"]);
    git(["commit", "-q", "-m", "rename only"]);

    const out = build(dir, ["--base", base, "--head", "HEAD"]);
    expect(Object.hasOwn(out, "bar.txt")).toBe(true);
    expect(out["bar.txt"]).toEqual([]);
  });

  it("--include-uncommitted unions a staged change", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "a.txt"), "committed\n");
    git(["add", "a.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(dir, "a.txt"), "committed\ncommitted-add\n");
    git(["add", "a.txt"]);
    git(["commit", "-q", "-m", "committed change"]);
    writeFileSync(join(dir, "b.txt"), "uncommitted-new\n");
    git(["add", "b.txt"]); // staged, not committed

    const pr = build(dir, ["--base", base, "--head", "HEAD"]);
    expect(Object.hasOwn(pr, "a.txt")).toBe(true);
    expect(Object.hasOwn(pr, "b.txt")).toBe(false);

    const local = build(dir, [
      "--base",
      base,
      "--head",
      "HEAD",
      "--include-uncommitted",
    ]);
    expect(Object.hasOwn(local, "a.txt")).toBe(true);
    expect(Object.hasOwn(local, "b.txt")).toBe(true);
  });

  it("preserves a path with spaces through the rename pipeline", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "my notes.md"), "unchanged\n");
    git(["add", "my notes.md"]);
    git(["commit", "-q", "-m", "seed file with space in name"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    git(["mv", "my notes.md", "my renamed notes.md"]);
    git(["commit", "-q", "-m", "rename"]);

    const out = build(dir, ["--base", base, "--head", "HEAD"]);
    expect(Object.hasOwn(out, "my renamed notes.md")).toBe(true);
    expect(Object.hasOwn(out, "my")).toBe(false);
    expect(Object.hasOwn(out, "renamed")).toBe(false);
    expect(Object.hasOwn(out, "notes.md")).toBe(false);
  });

  it("emits two renamed files as two distinct keys (NUL regression guard)", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    writeFileSync(join(dir, "b.txt"), "b\n");
    git(["add", "a.txt", "b.txt"]);
    git(["commit", "-q", "-m", "seed two files"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    git(["mv", "a.txt", "renamed1.txt"]);
    git(["mv", "b.txt", "renamed2.txt"]);
    git(["commit", "-q", "-m", "two renames"]);

    const out = build(dir, ["--base", base, "--head", "HEAD"]);
    expect(Object.hasOwn(out, "renamed1.txt")).toBe(true);
    expect(Object.hasOwn(out, "renamed2.txt")).toBe(true);
    expect(Object.hasOwn(out, "renamed1.txtrenamed2.txt")).toBe(false);
  });

  it("unions committed + uncommitted renames", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "a.txt"), "a\n");
    writeFileSync(join(dir, "b.txt"), "b\n");
    git(["add", "a.txt", "b.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    git(["mv", "a.txt", "renamed-committed.txt"]);
    git(["commit", "-q", "-m", "committed rename"]);
    git(["mv", "b.txt", "renamed-staged.txt"]); // staged

    const out = build(dir, [
      "--base",
      base,
      "--head",
      "HEAD",
      "--include-uncommitted",
    ]);
    expect(Object.hasOwn(out, "renamed-committed.txt")).toBe(true);
    expect(Object.hasOwn(out, "renamed-staged.txt")).toBe(true);
  });

  it("round-trips content containing triple quotes", () => {
    const { dir, git } = initRepo();
    writeFileSync(join(dir, "t.txt"), 'literal triple quote: """ in content\n');
    git(["add", "t.txt"]);
    git(["commit", "-q", "-m", "seed"]);
    const base = git(["rev-parse", "HEAD"]).trim();
    writeFileSync(
      join(dir, "t.txt"),
      'literal triple quote: """ in content\nadded\n',
    );
    git(["add", "t.txt"]);
    git(["commit", "-q", "-m", "modify"]);

    expect(
      Object.hasOwn(build(dir, ["--base", base, "--head", "HEAD"]), "t.txt"),
    ).toBe(true);
  });
});

describe("build-changed-lines CLI arg errors", () => {
  const SCRIPT = join(import.meta.dirname, "build-changed-lines.ts");

  function cli(args: readonly string[]) {
    return spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
  }

  it("exits 2 when --base and --head are missing", () => {
    const res = cli([]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("--base and --head are required");
  });

  it("exits 2 on an unknown argument", () => {
    const res = cli(["--base", "x", "--head", "y", "--bogus"]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown argument");
  });
});
