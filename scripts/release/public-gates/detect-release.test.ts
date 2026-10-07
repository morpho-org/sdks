import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { formatGithubOutput, listReleasedPackages } from "./detect-release.ts";

// Tests run concurrently, so directories are removed once the file is done.
const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "public-gates-test-"));
  dirs.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function commitAll(repo: string) {
  execFileSync("git", ["-C", repo, "add", "-A"]);
  execFileSync("git", [
    "-C",
    repo,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    "c",
  ]);
}

describe("listReleasedPackages", () => {
  function repoWith(versions: Record<string, object>[]) {
    const repo = tempDir();
    execFileSync("git", ["init", "-q", repo]);
    for (const commit of versions) {
      for (const [dir, manifest] of Object.entries(commit)) {
        write(repo, {
          [`packages/${dir}/package.json`]: JSON.stringify(manifest),
        });
      }
      commitAll(repo);
    }
    return repo;
  }

  test("lists public packages whose version changed", () => {
    const repo = repoWith([
      {
        a: { name: "@x/a", version: "1.0.0" },
        b: { name: "@x/b", version: "1.0.0" },
        p: { name: "@x/p", version: "1.0.0", private: true },
      },
      {
        a: { name: "@x/a", version: "1.1.0" },
        b: { name: "@x/b", version: "1.0.0", description: "edit" },
        p: { name: "@x/p", version: "2.0.0", private: true },
        c: { name: "@x/c", version: "0.1.0" },
      },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([
      { name: "@x/a", version: "1.1.0" },
      { name: "@x/c", version: "0.1.0" },
    ]);
  });

  test("lists a package made public at an unchanged version", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0", private: true } },
      { a: { name: "@x/a", version: "1.0.0" } },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([
      { name: "@x/a", version: "1.0.0" },
    ]);
  });

  test("returns nothing for a commit that changes no version", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/a", version: "1.0.0", description: "edit" } },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([]);
  });

  test("lists a package renamed at an unchanged version", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/b", version: "1.0.0" } },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([
      { name: "@x/b", version: "1.0.0" },
    ]);
  });

  test("compares with an explicit base, so a bump before the head commit counts", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/a", version: "1.1.0" } },
      { a: { name: "@x/a", version: "1.1.0", description: "edit" } },
    ]);
    expect(listReleasedPackages({ repo, sha: "HEAD" })).toEqual([]);
    expect(listReleasedPackages({ repo, sha: "HEAD", base: "HEAD~2" })).toEqual(
      [{ name: "@x/a", version: "1.1.0" }],
    );
  });

  test("falls back to the first parent for an all-zero base", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/a", version: "1.1.0" } },
    ]);
    expect(
      listReleasedPackages({ repo, sha: "HEAD", base: "0".repeat(40) }),
    ).toEqual([{ name: "@x/a", version: "1.1.0" }]);
  });

  test("fails on a public manifest without a version", () => {
    const repo = repoWith([
      { a: { name: "@x/a", version: "1.0.0" } },
      { a: { name: "@x/a" } },
    ]);
    expect(() => listReleasedPackages({ repo, sha: "HEAD" })).toThrow(
      '"packages/a/package.json" at HEAD needs a "name" and a "version".',
    );
  });

  test("fails when git can't read the parent commit", () => {
    const repo = repoWith([{ a: { name: "@x/a", version: "1.0.0" } }]);
    expect(() => listReleasedPackages({ repo, sha: "HEAD" })).toThrow();
  });
});

describe("formatGithubOutput", () => {
  test("writes released=true and the packages for a release", () => {
    expect(formatGithubOutput([{ name: "@x/a", version: "1.1.0" }])).toBe(
      'released=true\npackages=[{"name":"@x/a","version":"1.1.0"}]\n',
    );
  });

  test("writes released=false otherwise", () => {
    expect(formatGithubOutput([])).toBe("released=false\npackages=[]\n");
  });
});
